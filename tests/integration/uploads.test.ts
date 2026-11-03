import { beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/prisma";
import { POST as preflightRoute } from "@/app/api/uploads/preflight/route";
import { POST as createRoute } from "@/app/api/uploads/route";
import { POST as startRoute } from "@/app/api/uploads/files/[fileId]/start/route";
import { PUT as chunkRoute } from "@/app/api/uploads/files/[fileId]/content/route";
import { POST as cancelRoute } from "@/app/api/uploads/files/[fileId]/cancel/route";
import { GET as statusRoute } from "@/app/api/uploads/files/[fileId]/route";
import { GET as historyRoute } from "@/app/api/history/route";
import { GET as operationRoute } from "@/app/api/history/operations/[operationId]/route";
import { invalidateSettingsCache } from "@/lib/services/settings.service";
import { params, readJson, req, seedScenario, sessionFor, type Scenario } from "../support/fixtures";

const KIB = 1024;
let s: Scenario;
let session: { token: string; csrf: string };

beforeEach(async () => {
  s = await seedScenario();
  // Fragmentos de 320 KiB y carga simple hasta 0,5 MB para ejercitar ambos modos.
  await db.systemSetting.create({ data: { key: "settings.uploads", value: { chunkSizeKB: 320, simpleUploadMaxMB: 0.5, maxRetries: 2 } } });
  invalidateSettingsCache();
  session = await sessionFor(s.abcUser.id);
});

type Created = { operationId: string; chunkSize: number; files: { clientKey: string; fileId: string; finalName: string; strategy: "simple" | "session" }[] };

function bytes(size: number, seed = 1) {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + seed) % 251;
  return b;
}

async function createOp(files: { name: string; size: number; behavior?: "FAIL" | "REPLACE" | "RENAME"; finalName?: string }[], folderItemId = s.A.seguimiento, sess = session, projectId = s.A.id) {
  return readJson<Created & { error?: { code: string; details?: { problems: { clientKey: string; error: string }[] } } }>(
    await createRoute(
      req("POST", "/api/uploads", {
        session: sess,
        json: { projectId, folderItemId, files: files.map((f, i) => ({ clientKey: `k${i}`, originalName: f.name, finalName: f.finalName ?? f.name, size: f.size, mimeType: null, conflictBehavior: f.behavior ?? "FAIL" })) },
      }),
      {},
    ),
  );
}

async function sendAll(fileId: string, data: Uint8Array, chunk: number, sess = session) {
  const start = await startRoute(req("POST", `/api/uploads/files/${fileId}/start`, { session: sess }), params({ fileId }));
  expect(start.status).toBe(200);
  const { strategy } = (await start.json()) as { strategy: string };
  let last: Record<string, unknown> = {};
  const step = strategy === "simple" ? data.byteLength : chunk;
  for (let offset = 0; offset < data.byteLength; offset += step) {
    const end = Math.min(offset + step, data.byteLength) - 1;
    const part = data.slice(offset, end + 1);
    const res = await chunkRoute(
      req("PUT", `/api/uploads/files/${fileId}/content`, { session: sess, body: part, headers: { "content-range": `bytes ${offset}-${end}/${data.byteLength}`, "content-length": String(part.byteLength) } }),
      params({ fileId }),
    );
    last = { status: res.status, ...(await res.json()) };
    if (res.status !== 200) return last;
  }
  return last;
}

describe("DOCUMENTOS: carga", () => {
  it("carga un archivo, confirma que existe en el destino y registra la operación", async () => {
    const data = bytes(1000);
    const op = await createOp([{ name: "Acta de inicio.pdf", size: data.byteLength }], s.A.inicio);
    expect(op.status).toBe(201);
    expect(op.body.files[0].strategy).toBe("simple");
    const r = await sendAll(op.body.files[0].fileId, data, op.body.chunkSize);
    expect(r).toMatchObject({ status: 200, done: true, storage: "demo", operationStatus: "COMPLETED" });
    const file = await db.uploadedFile.findUniqueOrThrow({ where: { id: op.body.files[0].fileId } });
    expect(file.status).toBe("SUCCESS");
    expect(file.verifiedAt).not.toBeNull();
    // El archivo existe realmente en el almacenamiento y con el contenido exacto.
    const item = await db.demoDriveItem.findUniqueOrThrow({ where: { id: file.driveItemId! } });
    expect(item.parentId).toBe(s.A.inicio);
    expect(item.name).toBe("Acta de inicio.pdf");
    const stored = await readFile(path.resolve(process.env.DEMO_STORAGE_DIR!, "files", item.id));
    expect(Buffer.compare(stored, Buffer.from(data))).toBe(0);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "DOCUMENT_UPLOADED" } });
    expect(audit).toMatchObject({ actorUserId: s.abcUser.id, documentName: "Acta de inicio.pdf", projectCode: "PA", folderPath: "/PA Proyecto A/1. Inicio" });
  });

  it("carga varios archivos, incluido uno grande por sesión fragmentada, con progreso", async () => {
    const small = bytes(200 * KIB, 2);
    const large = bytes(900 * KIB + 123, 3); // > 0,5 MB → sesión de carga, 3 fragmentos
    const op = await createOp([
      { name: "Informe.docx", size: small.byteLength },
      { name: "Planos estructurales.dwg", size: large.byteLength },
    ]);
    expect(op.body.files.map((f) => f.strategy)).toEqual(["simple", "session"]);
    const largeId = op.body.files[1].fileId;
    // Primer fragmento: progreso parcial persistido.
    await startRoute(req("POST", `/api/uploads/files/${largeId}/start`, { session }), params({ fileId: largeId }));
    const first = large.slice(0, 320 * KIB);
    const res1 = await readJson<{ done: boolean; bytesUploaded: number }>(
      await chunkRoute(req("PUT", `/api/uploads/files/${largeId}/content`, { session, body: first, headers: { "content-range": `bytes 0-${320 * KIB - 1}/${large.byteLength}`, "content-length": String(first.byteLength) } }), params({ fileId: largeId })),
    );
    expect(res1.body).toMatchObject({ done: false, bytesUploaded: 320 * KIB });
    const st = await readJson<{ status: string; bytesUploaded: number; nextExpectedRanges: string[] }>(await statusRoute(req("GET", `/api/uploads/files/${largeId}`, { session }), params({ fileId: largeId })));
    expect(st.body).toMatchObject({ status: "IN_PROGRESS", bytesUploaded: 320 * KIB, nextExpectedRanges: [`${320 * KIB}-`] });
    // Se reinicia limpio y se completa todo.
    expect(await sendAll(largeId, large, op.body.chunkSize)).toMatchObject({ done: true });
    expect(await sendAll(op.body.files[0].fileId, small, op.body.chunkSize)).toMatchObject({ done: true, operationStatus: "COMPLETED" });
    const opRow = await db.uploadOperation.findUniqueOrThrow({ where: { id: op.body.operationId } });
    expect(opRow).toMatchObject({ status: "COMPLETED", successCount: 2, totalFiles: 2 });
    const item = await db.demoDriveItem.findFirstOrThrow({ where: { name: "Planos estructurales.dwg" } });
    expect(Number(item.size)).toBe(large.byteLength);
  });

  it("detecta duplicados en la verificación previa y no sobrescribe silenciosamente", async () => {
    const data = bytes(100);
    const first = await createOp([{ name: "Acta.pdf", size: 100 }]);
    await sendAll(first.body.files[0].fileId, data, first.body.chunkSize);
    const pf = await readJson<{ canReplace: boolean; files: { conflict: unknown; suggestedName: string }[] }>(
      await preflightRoute(req("POST", "/api/uploads/preflight", { session, json: { projectId: s.A.id, folderItemId: s.A.seguimiento, files: [{ name: "acta.PDF", size: 5 }, { name: "Otro.pdf", size: 5 }] } }), {}),
    );
    expect(pf.body.canReplace).toBe(false);
    expect(pf.body.files[0].conflict).toBeTruthy();
    expect(pf.body.files[0].suggestedName).toBe("acta (1).PDF");
    expect(pf.body.files[1].conflict).toBeNull();
    // Intentar cargar con el mismo nombre sin decidir → 409.
    const dup = await createOp([{ name: "Acta.pdf", size: 100 }]);
    expect(dup.status).toBe(409);
    expect(dup.body.error?.details?.problems[0].error).toMatch(/Ya existe/);
    // El contratista no puede reemplazar si no está autorizado.
    const repl = await createOp([{ name: "Acta.pdf", size: 100, behavior: "REPLACE" }]);
    expect(repl.status).toBe(409);
    expect(repl.body.error?.details?.problems[0].error).toMatch(/reemplazar/);
    // Cambiar el nombre antes de cargar sí funciona.
    const ren = await createOp([{ name: "Acta.pdf", size: 100, behavior: "RENAME", finalName: "Acta (1).pdf" }]);
    expect(ren.status).toBe(201);
    expect(await sendAll(ren.body.files[0].fileId, data, ren.body.chunkSize)).toMatchObject({ done: true });
    expect(await db.demoDriveItem.count({ where: { parentId: s.A.seguimiento, isFolder: false } })).toBe(2);
  });

  it("el administrador puede reemplazar un documento existente de forma explícita", async () => {
    const v1 = bytes(100, 1);
    const op1 = await createOp([{ name: "Plan.pdf", size: 100 }]);
    await sendAll(op1.body.files[0].fileId, v1, op1.body.chunkSize);
    const admin = await sessionFor(s.admin.id);
    const v2 = bytes(150, 9);
    const op2 = await createOp([{ name: "Plan.pdf", size: 150, behavior: "REPLACE" }], s.A.seguimiento, admin);
    expect(op2.status).toBe(201);
    expect(await sendAll(op2.body.files[0].fileId, v2, op2.body.chunkSize, admin)).toMatchObject({ done: true });
    const item = await db.demoDriveItem.findFirstOrThrow({ where: { parentId: s.A.seguimiento, name: "Plan.pdf" } });
    expect(Number(item.size)).toBe(150);
  });

  it("valida en el servidor extensiones, tamaños y cantidad (sin confiar en el navegador)", async () => {
    expect((await createOp([{ name: "script.exe", size: 10 }])).status).toBe(409);
    expect((await createOp([{ name: "enorme.pdf", size: 300 * 1024 * 1024 }])).status).toBe(409);
    expect((await createOp([{ name: "renombrado.pdf", size: 10, behavior: "RENAME", finalName: "renombrado.exe" }])).status).toBe(409);
    await db.systemSetting.update({ where: { key: "settings.uploads" }, data: { value: { chunkSizeKB: 320, simpleUploadMaxMB: 0.5, maxFilesPerOperation: 2 } } });
    invalidateSettingsCache();
    expect((await createOp([{ name: "a.pdf", size: 1 }, { name: "b.pdf", size: 1 }, { name: "c.pdf", size: 1 }])).status).toBe(400);
  });

  it("rechaza fragmentos manipulados (rango, tamaño total, múltiplo de 320 KiB)", async () => {
    const large = bytes(700 * KIB);
    const op = await createOp([{ name: "Grande.zip", size: large.byteLength }]);
    const id = op.body.files[0].fileId;
    await startRoute(req("POST", `/api/uploads/files/${id}/start`, { session }), params({ fileId: id }));
    const put = (body: Uint8Array, range: string) => chunkRoute(req("PUT", `/api/uploads/files/${id}/content`, { session, body, headers: { "content-range": range, "content-length": String(body.byteLength) } }), params({ fileId: id }));
    expect((await put(large.slice(0, 1000), `bytes 0-999/${large.byteLength}`)).status).toBe(400); // no múltiplo
    expect((await put(large.slice(0, 1000), "bytes 0-999/1000")).status).toBe(400); // total distinto
    expect((await put(large.slice(0, 100), `bytes 0-999/${large.byteLength}`)).status).toBe(400); // longitud distinta
    expect((await put(large.slice(0, 10), "rango-falso")).status).toBe(400);
  });

  it("un fallo en un archivo no detiene a los demás (resultado parcial) y permite cancelar", async () => {
    const op = await createOp([
      { name: "Bueno.pdf", size: 100 },
      { name: "Choque.pdf", size: 100 },
      { name: "Cancelado.pdf", size: 100 },
    ]);
    const [good, clash, cancel] = op.body.files;
    // Otra persona crea "Choque.pdf" en el destino justo antes (condición de carrera).
    await db.demoDriveItem.create({ data: { id: crypto.randomUUID(), driveId: "demo-drive", parentId: s.A.seguimiento, name: "Choque.pdf", nameLower: "choque.pdf", isFolder: false, size: BigInt(1), createdByName: "otro" } });
    expect(await sendAll(good.fileId, bytes(100), op.body.chunkSize)).toMatchObject({ done: true });
    const r = await sendAll(clash.fileId, bytes(100), op.body.chunkSize);
    expect(r).toMatchObject({ status: 409, error: { code: "NAME_ALREADY_EXISTS" } });
    expect((await cancelRoute(req("POST", `/api/uploads/files/${cancel.fileId}/cancel`, { session }), params({ fileId: cancel.fileId }))).status).toBe(200);
    const row = await db.uploadOperation.findUniqueOrThrow({ where: { id: op.body.operationId } });
    expect(row).toMatchObject({ status: "PARTIAL", successCount: 1, errorCount: 1, cancelledCount: 1 });
    const clashRow = await db.uploadedFile.findUniqueOrThrow({ where: { id: clash.fileId } });
    expect(clashRow.status).toBe("ERROR");
    expect(clashRow.errorCode).toBe("NAME_ALREADY_EXISTS");
  });

  it("otro usuario no puede enviar contenido a una carga ajena", async () => {
    const op = await createOp([{ name: "Mio.pdf", size: 100 }]);
    const id = op.body.files[0].fileId;
    const intruder = await sessionFor(s.xyzUser.id);
    expect((await startRoute(req("POST", `/api/uploads/files/${id}/start`, { session: intruder }), params({ fileId: id }))).status).toBe(403);
    const body = bytes(100);
    const put = await chunkRoute(req("PUT", `/api/uploads/files/${id}/content`, { session: intruder, body, headers: { "content-range": "bytes 0-99/100", "content-length": "100" } }), params({ fileId: id }));
    expect(put.status).toBe(403);
  });

  it("un usuario suspendido a mitad de la carga ya no puede continuar", async () => {
    const op = await createOp([{ name: "Medio.zip", size: 700 * KIB }]);
    const id = op.body.files[0].fileId;
    await startRoute(req("POST", `/api/uploads/files/${id}/start`, { session }), params({ fileId: id }));
    await db.user.update({ where: { id: s.abcUser.id }, data: { status: "SUSPENDED" } });
    const part = bytes(320 * KIB);
    const r = await chunkRoute(req("PUT", `/api/uploads/files/${id}/content`, { session, body: part, headers: { "content-range": `bytes 0-${320 * KIB - 1}/${700 * KIB}`, "content-length": String(part.byteLength) } }), params({ fileId: id }));
    expect(r.status).toBe(403);
  });
});

describe("HISTORIAL", () => {
  it("el contratista ve solo sus cargas y el administrador ve todas, con filtros", async () => {
    const op = await createOp([{ name: "Propio.pdf", size: 10 }]);
    await sendAll(op.body.files[0].fileId, bytes(10), op.body.chunkSize);
    const xyz = await sessionFor(s.xyzUser.id);
    const opX = await createOp([{ name: "Ajeno.pdf", size: 10 }], s.C.seguimiento, xyz, s.C.id);
    await sendAll(opX.body.files[0].fileId, bytes(10), opX.body.chunkSize, xyz);

    type H = { total: number; rows: { name: string; status: string; contractor: string; company: string; project: { code: string }; stage: string; folderPath: string }[] };
    const mine = await readJson<H>(await historyRoute(req("GET", "/api/history", { session }), {}));
    expect(mine.body.rows.map((r) => r.name)).toEqual(["Propio.pdf"]);
    expect(mine.body.rows[0]).toMatchObject({ status: "SUCCESS", contractor: "Carlos ABC", company: "Constructora ABC", stage: "Ejecución", project: { code: "PA" } });
    // El contratista no puede ampliar el alcance con filtros de otro usuario.
    const spoof = await readJson<H>(await historyRoute(req("GET", `/api/history?userId=${s.xyzUser.id}`, { session }), {}));
    expect(spoof.body.rows.map((r) => r.name)).toEqual(["Propio.pdf"]);
    const admin = await sessionFor(s.admin.id);
    const all = await readJson<H>(await historyRoute(req("GET", "/api/history", { session: admin }), {}));
    expect(all.body.total).toBe(2);
    const byCompany = await readJson<H>(await historyRoute(req("GET", `/api/history?companyId=${s.xyz.id}`, { session: admin }), {}));
    expect(byCompany.body.rows.map((r) => r.name)).toEqual(["Ajeno.pdf"]);
    const byStatus = await readJson<H>(await historyRoute(req("GET", "/api/history?status=ERROR", { session: admin }), {}));
    expect(byStatus.body.total).toBe(0);
    // Detalle de operación: dueño y administrador sí; otro contratista no.
    expect((await operationRoute(req("GET", `/api/history/operations/${op.body.operationId}`, { session }), params({ operationId: op.body.operationId }))).status).toBe(200);
    expect((await operationRoute(req("GET", `/api/history/operations/${op.body.operationId}`, { session: admin }), params({ operationId: op.body.operationId }))).status).toBe(200);
    expect((await operationRoute(req("GET", `/api/history/operations/${op.body.operationId}`, { session: xyz }), params({ operationId: op.body.operationId }))).status).toBe(403);
  });
});
