import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/prisma";
import { GET as listProjects } from "@/app/api/projects/route";
import { GET as projectDetail } from "@/app/api/projects/[projectId]/route";
import { GET as browse, POST as createFolder } from "@/app/api/projects/[projectId]/folders/route";
import { PATCH as renameFolder, DELETE as deleteFolder } from "@/app/api/projects/[projectId]/folders/[itemId]/route";
import { POST as preflight } from "@/app/api/uploads/preflight/route";
import { POST as createUpload } from "@/app/api/uploads/route";
import { GET as adminUsers, POST as adminCreateUser } from "@/app/api/admin/users/route";
import { GET as adminAudit } from "@/app/api/admin/audit/route";
import { PUT as adminSettings } from "@/app/api/admin/settings/[section]/route";
import { GET as adminDashboard } from "@/app/api/admin/dashboard/route";
import { params, readJson, req, seedScenario, sessionFor, type Scenario } from "../support/fixtures";

let s: Scenario;
beforeEach(async () => {
  s = await seedScenario();
});

type ProjectsBody = { projects: { id: string; code: string }[] };

describe("PERMISOS por proyecto", () => {
  it("el contratista ve únicamente sus proyectos", async () => {
    const session = await sessionFor(s.abcUser.id);
    const r = await readJson<ProjectsBody>(await listProjects(req("GET", "/api/projects", { session }), {}));
    expect(r.status).toBe(200);
    expect(r.body.projects.map((p) => p.code).sort()).toEqual(["PA", "PB"]);
  });

  it("el administrador puede consultar todos los proyectos", async () => {
    const session = await sessionFor(s.admin.id);
    const r = await readJson<ProjectsBody>(await listProjects(req("GET", "/api/projects", { session }), {}));
    expect(r.body.projects.map((p) => p.code).sort()).toEqual(["PA", "PB", "PC"]);
    const d = await projectDetail(req("GET", `/api/projects/${s.C.id}`, { session }), params({ projectId: s.C.id }));
    expect(d.status).toBe(200);
  });

  it("un proyecto archivado deja de estar disponible para el contratista", async () => {
    await db.project.update({ where: { id: s.B.id }, data: { status: "ARCHIVED" } });
    const session = await sessionFor(s.abcUser.id);
    const r = await readJson<ProjectsBody>(await listProjects(req("GET", "/api/projects", { session }), {}));
    expect(r.body.projects.map((p) => p.code)).toEqual(["PA"]);
    expect((await browse(req("GET", `/api/projects/${s.B.id}/folders`, { session }), params({ projectId: s.B.id }))).status).toBe(403);
  });

  it("SEGURIDAD: manipular el ID de proyecto devuelve 403 y queda auditado", async () => {
    const session = await sessionFor(s.abcUser.id);
    const r = await readJson(await projectDetail(req("GET", `/api/projects/${s.C.id}`, { session }), params({ projectId: s.C.id })));
    expect(r.status).toBe(403);
    const f = await browse(req("GET", `/api/projects/${s.C.id}/folders?itemId=${s.C.seguimiento}`, { session }), params({ projectId: s.C.id }));
    expect(f.status).toBe(403);
    const bogus = await projectDetail(req("GET", "/api/projects/no-es-un-uuid", { session }), params({ projectId: "no-es-un-uuid" }));
    expect([403, 404]).toContain(bogus.status);
    expect(await db.auditLog.count({ where: { action: "ACCESS_DENIED", actorUserId: s.abcUser.id } })).toBeGreaterThanOrEqual(2);
  });

  it("SEGURIDAD: no puede usar una carpeta de otro proyecto a través de un proyecto propio", async () => {
    const session = await sessionFor(s.abcUser.id);
    // Proyecto propio (A) + identificador de carpeta del proyecto ajeno (C).
    const r = await readJson(await browse(req("GET", `/api/projects/${s.A.id}/folders?itemId=${s.C.seguimiento}`, { session }), params({ projectId: s.A.id })));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    const c = await createFolder(req("POST", `/api/projects/${s.A.id}/folders`, { session, json: { parentItemId: s.C.seguimiento, name: "Intrusa" } }), params({ projectId: s.A.id }));
    expect(c.status).toBe(403);
    expect(await db.demoDriveItem.count({ where: { name: "Intrusa" } })).toBe(0);
  });

  it("el contratista no puede crear carpetas en otro proyecto", async () => {
    const session = await sessionFor(s.abcUser.id);
    const r = await createFolder(req("POST", `/api/projects/${s.C.id}/folders`, { session, json: { parentItemId: s.C.seguimiento, name: "No permitida" } }), params({ projectId: s.C.id }));
    expect(r.status).toBe(403);
    expect(await db.demoDriveItem.count({ where: { name: "No permitida" } })).toBe(0);
  });

  it("SEGURIDAD: no puede cargar documentos en carpetas ajenas", async () => {
    const session = await sessionFor(s.abcUser.id);
    const files = [{ name: "a.pdf", size: 10 }];
    expect((await preflight(req("POST", "/api/uploads/preflight", { session, json: { projectId: s.C.id, folderItemId: s.C.seguimiento, files } }), {})).status).toBe(403);
    expect((await preflight(req("POST", "/api/uploads/preflight", { session, json: { projectId: s.A.id, folderItemId: s.C.seguimiento, files } }), {})).status).toBe(403);
    const create = await createUpload(
      req("POST", "/api/uploads", { session, json: { projectId: s.A.id, folderItemId: s.C.planos, files: [{ clientKey: "k", originalName: "a.pdf", finalName: "a.pdf", size: 10, conflictBehavior: "FAIL" }] } }),
      {},
    );
    expect(create.status).toBe(403);
    expect(await db.uploadOperation.count()).toBe(0);
  });

  it("el contratista no puede indicar otra ubicación (parámetro reservado al administrador)", async () => {
    const session = await sessionFor(s.abcUser.id);
    const r = await browse(req("GET", `/api/projects/${s.A.id}/folders?locationId=${s.C.locationId}`, { session }), params({ projectId: s.A.id }));
    expect(r.status).toBe(403);
  });

  it("no puede renombrar ni eliminar carpetas (solo el administrador)", async () => {
    const session = await sessionFor(s.abcUser.id);
    const ren = await renameFolder(req("PATCH", `/api/projects/${s.A.id}/folders/${s.A.seguimiento}`, { session, json: { newName: "X" } }), params({ projectId: s.A.id, itemId: s.A.seguimiento }));
    expect(ren.status).toBe(403);
    const del = await deleteFolder(req("DELETE", `/api/projects/${s.A.id}/folders/${s.A.planos}`, { session, json: { confirmName: "2.07 Planos" } }), params({ projectId: s.A.id, itemId: s.A.planos }));
    expect(del.status).toBe(403);
    expect(await db.demoDriveItem.count({ where: { id: s.A.planos } })).toBe(1);
  });

  it("el rol Consulta puede ver carpetas y documentos, pero no cargar ni crear carpetas", async () => {
    const session = await sessionFor(s.viewer.id);
    expect((await browse(req("GET", `/api/projects/${s.A.id}/folders?itemId=${s.A.ejecucion}`, { session }), params({ projectId: s.A.id }))).status).toBe(200);
    expect((await createFolder(req("POST", `/api/projects/${s.A.id}/folders`, { session, json: { parentItemId: s.A.seguimiento, name: "Visor" } }), params({ projectId: s.A.id }))).status).toBe(403);
    expect((await preflight(req("POST", "/api/uploads/preflight", { session, json: { projectId: s.A.id, folderItemId: s.A.seguimiento, files: [{ name: "a.pdf", size: 1 }] } }), {})).status).toBe(403);
  });
});

describe("SEGURIDAD: panel administrativo", () => {
  it("un contratista no puede acceder a la API administrativa", async () => {
    const session = await sessionFor(s.abcUser.id);
    expect((await adminUsers(req("GET", "/api/admin/users", { session }), {})).status).toBe(403);
    expect((await adminAudit(req("GET", "/api/admin/audit", { session }), {})).status).toBe(403);
    expect((await adminDashboard(req("GET", "/api/admin/dashboard", { session }), {})).status).toBe(403);
    const create = await adminCreateUser(
      req("POST", "/api/admin/users", { session, json: { fullName: "Escalada", email: "x@y.example", roleKey: "ADMIN", identityType: "GUEST", projectIds: [] } }),
      {},
    );
    expect(create.status).toBe(403);
    expect(await db.user.count({ where: { email: "x@y.example" } })).toBe(0);
    const set = await adminSettings(req("PUT", "/api/admin/settings/uploads", { session, json: {} }), params({ section: "uploads" }));
    expect(set.status).toBe(403);
  });

  it("sin autenticación no se ejecuta ninguna operación administrativa", async () => {
    expect((await adminUsers(req("GET", "/api/admin/users"), {})).status).toBe(401);
    expect((await adminCreateUser(req("POST", "/api/admin/users", { json: { email: "a@b.example" } }), {})).status).toBe(401);
  });
});
