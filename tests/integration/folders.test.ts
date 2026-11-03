import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/prisma";
import { GET as browse, POST as createFolder } from "@/app/api/projects/[projectId]/folders/route";
import { PATCH as renameFolder, DELETE as deleteFolder } from "@/app/api/projects/[projectId]/folders/[itemId]/route";
import { GET as projectDetail } from "@/app/api/projects/[projectId]/route";
import { params, readJson, req, seedScenario, sessionFor, type Scenario } from "../support/fixtures";

let s: Scenario;
let session: { token: string; csrf: string };
beforeEach(async () => {
  s = await seedScenario();
  session = await sessionFor(s.abcUser.id);
});

type View = { folder: { id: string; name: string; isProtected: boolean }; stage: { key: string } | null; children: { id: string; name: string; isFolder: boolean; isProtected: boolean; createdInPortal: unknown }[]; breadcrumbs: { name: string }[]; fullPath: string; capabilities: { canUpload: boolean; canCreateFolder: boolean } };

const create = (projectId: string, parentItemId: string, name: string, sess = session) =>
  createFolder(req("POST", `/api/projects/${projectId}/folders`, { session: sess, json: { parentItemId, name } }), params({ projectId }));

describe("CARPETAS: consulta de estructura", () => {
  it("devuelve las etapas configuradas del proyecto", async () => {
    const r = await readJson<{ stages: { key: string; available: boolean; folderName: string }[] }>(await projectDetail(req("GET", `/api/projects/${s.A.id}`, { session }), params({ projectId: s.A.id })));
    expect(r.body.stages.map((x) => [x.key, x.available, x.folderName])).toEqual([
      ["inicio", true, "1. Inicio"],
      ["ejecucion", true, "2. Ejecución"],
      ["cierre", true, "3. Cierre"],
    ]);
  });

  it("consulta las subcarpetas reales de una etapa y marca la estructura protegida", async () => {
    const r = await readJson<View>(await browse(req("GET", `/api/projects/${s.A.id}/folders?itemId=${s.A.ejecucion}`, { session }), params({ projectId: s.A.id })));
    expect(r.status).toBe(200);
    expect(r.body.stage?.key).toBe("ejecucion");
    expect(r.body.folder.isProtected).toBe(true);
    expect(r.body.children.map((c) => c.name)).toEqual(["2.06 Seguimiento", "2.07 Planos"]);
    expect(r.body.children.every((c) => c.isProtected)).toBe(true);
    expect(r.body.fullPath).toBe("/PA Proyecto A/2. Ejecución");
    expect(r.body.capabilities).toEqual({ canUpload: true, canCreateFolder: true, canManage: false });
  });

  it("en la raíz de la ubicación (fuera de etapas) el contratista no puede cargar ni crear", async () => {
    const r = await readJson<View>(await browse(req("GET", `/api/projects/${s.A.id}/folders`, { session }), params({ projectId: s.A.id })));
    expect(r.body.capabilities.canUpload).toBe(false);
    expect(r.body.capabilities.canCreateFolder).toBe(false);
    expect((await create(s.A.id, s.A.rootId, "4. Etapa inventada")).status).toBe(403);
  });
});

describe("CARPETAS: creación", () => {
  it("crea una carpeta, confirma su existencia y la registra", async () => {
    const r = await readJson<{ folder: { id: string; name: string }; path: string }>(await create(s.A.id, s.A.seguimiento, "Ensayos de laboratorio"));
    expect(r.status).toBe(201);
    expect(r.body.path).toBe("/PA Proyecto A/2. Ejecución/2.06 Seguimiento/Ensayos de laboratorio");
    const stored = await db.demoDriveItem.findUniqueOrThrow({ where: { id: r.body.folder.id } });
    expect(stored.parentId).toBe(s.A.seguimiento);
    const op = await db.folderOperation.findFirstOrThrow({ where: { driveItemId: r.body.folder.id } });
    expect(op).toMatchObject({ type: "CREATE", result: "SUCCESS", userId: s.abcUser.id, projectId: s.A.id, stageKey: "ejecucion", environment: "DEMO" });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "FOLDER_CREATED" } });
    expect(audit).toMatchObject({ actorUserId: s.abcUser.id, projectCode: "PA", folderPath: r.body.path });
    // El árbol se actualiza: aparece al consultar la carpeta padre, marcada como creada en el portal.
    const v = await readJson<View>(await browse(req("GET", `/api/projects/${s.A.id}/folders?itemId=${s.A.seguimiento}`, { session }), params({ projectId: s.A.id })));
    const child = v.body.children.find((c) => c.name === "Ensayos de laboratorio")!;
    expect(child.createdInPortal).toBeTruthy();
    expect(child.isProtected).toBe(false);
  });

  it("crea subcarpetas anidadas (Proyecto A › Ejecución › Seguimiento › Ensayos › Resultados mensuales)", async () => {
    const lvl1 = await readJson<{ folder: { id: string } }>(await create(s.A.id, s.A.seguimiento, "Ensayos de laboratorio"));
    const lvl2 = await readJson<{ folder: { id: string }; path: string; breadcrumbs: { name: string }[] }>(await create(s.A.id, lvl1.body.folder.id, "Resultados mensuales"));
    expect(lvl2.status).toBe(201);
    expect(lvl2.body.path).toBe("/PA Proyecto A/2. Ejecución/2.06 Seguimiento/Ensayos de laboratorio/Resultados mensuales");
    expect(lvl2.body.breadcrumbs.map((b) => b.name)).toEqual(["Proyecto A", "2. Ejecución", "2.06 Seguimiento", "Ensayos de laboratorio", "Resultados mensuales"]);
  });

  it("evita duplicados en el mismo nivel (sin distinguir mayúsculas)", async () => {
    expect((await create(s.A.id, s.A.seguimiento, "Ensayos")).status).toBe(201);
    const dup = await readJson(await create(s.A.id, s.A.seguimiento, "ENSAYOS"));
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ error: { code: "NAME_ALREADY_EXISTS" } });
    expect(await db.demoDriveItem.count({ where: { parentId: s.A.seguimiento, nameLower: "ensayos" } })).toBe(1);
    // El mismo nombre en otro nivel sí está permitido.
    expect((await create(s.A.id, s.A.planos, "Ensayos")).status).toBe(201);
  });

  it("maneja la concurrencia: dos creaciones simultáneas del mismo nombre producen una sola carpeta", async () => {
    const other = await sessionFor(s.abcUser.id);
    const [a, b] = await Promise.all([create(s.A.id, s.A.seguimiento, "Simultánea"), create(s.A.id, s.A.seguimiento, "Simultánea", other)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.demoDriveItem.count({ where: { parentId: s.A.seguimiento, nameLower: "simultánea" } })).toBe(1);
  });

  it.each([["", 400], ["   ", 400], ["con/barra", 400], ["..", 400], ["a:b", 400], ["CON", 400], ["x".repeat(300), 400]])("rechaza nombres inválidos: %j", async (name, status) => {
    expect((await create(s.A.id, s.A.seguimiento, name as string)).status).toBe(status);
  });

  it("rechaza carpetas padre inexistentes o identificadores manipulados", async () => {
    expect((await create(s.A.id, "00000000-0000-0000-0000-000000000000", "X")).status).toBe(403);
    expect((await create(s.A.id, "../../demo-root", "X")).status).toBe(400);
    expect((await create(s.A.id, "demo-root", "X")).status).toBe(403); // raíz de la biblioteca: fuera del proyecto
  });

  it("respeta la profundidad máxima configurada", async () => {
    await db.systemSetting.create({ data: { key: "settings.structure", value: { maxFolderDepth: 3 } } });
    (await import("@/lib/services/settings.service")).invalidateSettingsCache();
    const l1 = await readJson<{ folder: { id: string } }>(await create(s.A.id, s.A.seguimiento, "N3"));
    expect(l1.status).toBe(201);
    const l2 = await readJson(await create(s.A.id, l1.body.folder.id, "N4"));
    expect(l2.status).toBe(400);
  });
});

describe("CARPETAS: administración (renombrar / eliminar)", () => {
  it("el administrador no puede renombrar ni eliminar la estructura principal", async () => {
    const admin = await sessionFor(s.admin.id);
    for (const id of [s.A.ejecucion, s.A.seguimiento, s.A.rootId]) {
      const r = await readJson(await renameFolder(req("PATCH", `/api/projects/${s.A.id}/folders/${id}`, { session: admin, json: { newName: "Renombrada" } }), params({ projectId: s.A.id, itemId: id })));
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ error: { code: "PROTECTED_FOLDER" } });
    }
    const d = await deleteFolder(req("DELETE", `/api/projects/${s.A.id}/folders/${s.A.dossier}`, { session: admin, json: { confirmName: "Dossier" } }), params({ projectId: s.A.id, itemId: s.A.dossier }));
    expect(d.status).toBe(403);
  });

  it("el administrador renombra y elimina carpetas adicionales con confirmación", async () => {
    const created = await readJson<{ folder: { id: string } }>(await create(s.A.id, s.A.seguimiento, "Temporal"));
    const id = created.body.folder.id;
    const admin = await sessionFor(s.admin.id);
    const ren = await readJson<{ name: string }>(await renameFolder(req("PATCH", `/api/projects/${s.A.id}/folders/${id}`, { session: admin, json: { newName: "Temporal revisada" } }), params({ projectId: s.A.id, itemId: id })));
    expect(ren.status).toBe(200);
    expect(ren.body.name).toBe("Temporal revisada");
    const badConfirm = await deleteFolder(req("DELETE", `/api/projects/${s.A.id}/folders/${id}`, { session: admin, json: { confirmName: "temporal" } }), params({ projectId: s.A.id, itemId: id }));
    expect(badConfirm.status).toBe(400);
    const del = await deleteFolder(req("DELETE", `/api/projects/${s.A.id}/folders/${id}`, { session: admin, json: { confirmName: "Temporal revisada" } }), params({ projectId: s.A.id, itemId: id }));
    expect(del.status).toBe(200);
    expect(await db.demoDriveItem.count({ where: { id } })).toBe(0);
    expect(await db.folderOperation.count({ where: { driveItemId: id } })).toBe(3);
  });
});
