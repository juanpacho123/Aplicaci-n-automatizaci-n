import { describe, expect, it } from "vitest";
import { GraphClient, GraphError } from "@/lib/graph/client";
import { GraphStorageProvider, readablePath } from "@/lib/storage/graph-provider";
import { driveMatchesLibraryUrl } from "@/lib/graph/sites";

/**
 * Pruebas del proveedor real de SharePoint contra un fetch simulado.
 * Verifican que se llama a los endpoints correctos de Microsoft Graph con los
 * encabezados y el comportamiento de conflictos esperados.
 */

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };
const BASE = "https://graph.microsoft.com/v1.0";
const DRIVE = "b!drive-id";

function fakeFetch(handler: (c: Call) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    const r = handler(call);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json", ...r.headers } });
  }) as typeof fetch;
  return { calls, impl };
}

const item = (id: string, name: string, parentId: string, path: string, extra: object = {}) => ({
  id,
  name,
  folder: { childCount: 0 },
  parentReference: { driveId: DRIVE, id: parentId, path: `/drives/${DRIVE}/root:${path}` },
  webUrl: `https://dac365.sharepoint.com/x/${encodeURIComponent(name)}`,
  ...extra,
});

function provider(handler: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch(handler);
  return { p: new GraphStorageProvider(new GraphClient(async () => "TOKEN", BASE, f.impl, 2)), calls: f.calls };
}

describe("GraphStorageProvider", () => {
  it("convierte rutas de Graph en rutas legibles", () => {
    expect(readablePath(`/drives/${DRIVE}/root:/Proyecto%20A/2.%20Ejecuci%C3%B3n`)).toBe("/Proyecto A/2. Ejecución");
    expect(readablePath(`/drives/${DRIVE}/root:`)).toBe("/");
  });

  it("crea carpetas con conflictBehavior=fail y token delegado", async () => {
    const { p, calls } = provider((c) => {
      if (c.method === "POST") return { status: 201, body: item("new", "Ensayos", "parent", "/Proyecto A/2. Ejecución/2.06 Seguimiento") };
      return { status: 200, body: item("new", "Ensayos", "parent", "/Proyecto A/2. Ejecución/2.06 Seguimiento") };
    });
    const created = await p.createFolder(DRIVE, "parent", "Ensayos");
    expect(created.id).toBe("new");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${BASE}/drives/${encodeURIComponent(DRIVE)}/items/parent/children`);
    expect(post.body).toEqual({ name: "Ensayos", folder: {}, "@microsoft.graph.conflictBehavior": "fail" });
    expect(post.headers.Authorization).toBe("Bearer TOKEN");
    expect(p.fullPath(created)).toBe("/Proyecto A/2. Ejecución/2.06 Seguimiento/Ensayos");
  });

  it("traduce 409 nameAlreadyExists a NAME_ALREADY_EXISTS (concurrencia)", async () => {
    const { p } = provider(() => ({ status: 409, body: { error: { code: "nameAlreadyExists", message: "Name already exists" } } }));
    await expect(p.createFolder(DRIVE, "parent", "Dup")).rejects.toMatchObject({ code: "NAME_ALREADY_EXISTS" });
  });

  it("traduce 403 y 404 de SharePoint", async () => {
    const forb = provider(() => ({ status: 403, body: { error: { code: "accessDenied" } } }));
    await expect(forb.p.getItem(DRIVE, "x")).rejects.toMatchObject({ code: "SHAREPOINT_FORBIDDEN", status: 403 });
    const nf = provider(() => ({ status: 404, body: { error: { code: "itemNotFound" } } }));
    await expect(nf.p.getItem(DRIVE, "x")).rejects.toMatchObject({ code: "SHAREPOINT_NOT_FOUND" });
  });

  it("reintenta ante 429 respetando Retry-After", async () => {
    let n = 0;
    const { p, calls } = provider(() => (++n === 1 ? { status: 429, headers: { "retry-after": "0" }, body: { error: { code: "tooManyRequests" } } } : { status: 200, body: item("a", "A", "r", "/") }));
    const it1 = await p.getItem(DRIVE, "a");
    expect(it1.id).toBe("a");
    expect(calls).toHaveLength(2);
  });

  it("carga simple sin sobrescribir (conflictBehavior=fail) o reemplazando si se autoriza", async () => {
    const { p, calls } = provider(() => ({ status: 201, body: { id: "f", name: "a.pdf", size: 3, file: { mimeType: "application/pdf" }, parentReference: { driveId: DRIVE, id: "folder", path: `/drives/${DRIVE}/root:/P` } } }));
    await p.uploadSmall(DRIVE, "folder", "Acta de inicio.pdf", new Uint8Array([1, 2, 3]), false);
    await p.uploadSmall(DRIVE, "folder", "Acta de inicio.pdf", new Uint8Array([1, 2, 3]), true);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/drives/${encodeURIComponent(DRIVE)}/items/folder:/Acta%20de%20inicio.pdf:/content?@microsoft.graph.conflictBehavior=fail`);
    expect(calls[1].url).toContain("conflictBehavior=replace");
  });

  it("usa sesiones de carga y NO envía Authorization a la URL preautenticada", async () => {
    const uploadUrl = "https://dac365.sharepoint.com/_api/v2.0/drives/x/items/y/uploadSession?guid=abc";
    const { p, calls } = provider((c) => {
      if (c.url.endsWith("createUploadSession")) return { status: 200, body: { uploadUrl, expirationDateTime: "2026-11-04T00:00:00Z" } };
      if (c.url === uploadUrl && c.headers["Content-Range"] === "bytes 0-327679/400000") return { status: 202, body: { nextExpectedRanges: ["327680-"] } };
      if (c.url === uploadUrl) return { status: 201, body: { id: "file1", name: "Planos.dwg", size: 400000, file: {}, parentReference: { driveId: DRIVE, id: "folder", path: `/drives/${DRIVE}/root:/P` } } };
      return { status: 500 };
    });
    const session = await p.createUploadSession(DRIVE, "folder", "Planos.dwg", 400000, false);
    expect(calls[0].body).toEqual({ item: { "@microsoft.graph.conflictBehavior": "fail", name: "Planos.dwg" } });
    const r1 = await p.uploadChunk(session.uploadUrl, 0, 327679, 400000, new Uint8Array(327680));
    expect(r1).toEqual({ done: false, nextExpectedRanges: ["327680-"] });
    const r2 = await p.uploadChunk(session.uploadUrl, 327680, 399999, 400000, new Uint8Array(400000 - 327680));
    expect(r2.done).toBe(true);
    const chunkCalls = calls.filter((c) => c.url === uploadUrl);
    expect(chunkCalls.every((c) => !("Authorization" in c.headers))).toBe(true);
  });

  it("verifica pertenencia a la ubicación por ruta y rechaza otras ramas", async () => {
    const tree: Record<string, ReturnType<typeof item>> = {
      root: item("root", "Proyecto A", "lib", ""),
      inside: item("inside", "Ensayos", "seg", "/Proyecto A/2. Ejecución/2.06 Seguimiento"),
      outside: item("outside", "Otro", "x", "/Proyecto B/2. Ejecución"),
      sneaky: item("sneaky", "x", "y", "/Proyecto AB/2. Ejecución"),
    };
    const { p } = provider((c) => {
      const id = decodeURIComponent(c.url.split("/items/")[1].split("?")[0]);
      return tree[id] ? { status: 200, body: tree[id] } : { status: 404, body: { error: { code: "itemNotFound" } } };
    });
    expect(await p.isWithin(DRIVE, "root", "inside")).toBe(true);
    expect(await p.isWithin(DRIVE, "root", "outside")).toBe(false);
    expect(await p.isWithin(DRIVE, "root", "sneaky")).toBe(false); // prefijo de texto sin separador
  });

  it("no envía el token a enlaces de paginación de otro origen", async () => {
    const { p } = provider(() => ({ status: 200, body: { value: [], "@odata.nextLink": "https://malicioso.example/robar" } }));
    await expect(p.listChildren(DRIVE, "root")).rejects.toBeInstanceOf(GraphError);
  });

  it("identifica la biblioteca por su URL relativa", () => {
    const drive = { id: "b!x", name: "Proyectos de Inversión Operaciones", driveType: "documentLibrary", webUrl: "https://dac365.sharepoint.com/sites/OperacionesIngenierayMantenimiento/IMA/Proyectos%20de%20Inversin%20Operaciones" };
    expect(driveMatchesLibraryUrl(drive, "/sites/OperacionesIngenierayMantenimiento/IMA/Proyectos de Inversin Operaciones")).toBe(true);
    expect(driveMatchesLibraryUrl(drive, "/sites/OperacionesIngenierayMantenimiento/IMA/Documentos compartidos")).toBe(false);
  });
});
