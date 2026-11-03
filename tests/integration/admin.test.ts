import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/prisma";
import { resetEnvCache } from "@/lib/config/env";
import { GET as listProjects } from "@/app/api/projects/route";
import { POST as createUserRoute } from "@/app/api/admin/users/route";
import { PUT as setProjectsRoute } from "@/app/api/admin/users/[userId]/projects/route";
import { POST as suspendRoute } from "@/app/api/admin/users/[userId]/suspend/route";
import { POST as reactivateRoute } from "@/app/api/admin/users/[userId]/reactivate/route";
import { PUT as roleRoute } from "@/app/api/admin/users/[userId]/role/route";
import { POST as authorizeRoute } from "@/app/api/admin/users/[userId]/authorize/route";
import { POST as publicRequest } from "@/app/api/access-requests/route";
import { POST as requestStatus } from "@/app/api/access-requests/status/route";
import { POST as requestRespond } from "@/app/api/access-requests/respond/route";
import { POST as approveRoute } from "@/app/api/admin/access-requests/[requestId]/approve/route";
import { POST as infoRoute } from "@/app/api/admin/access-requests/[requestId]/request-info/route";
import { POST as rejectRoute } from "@/app/api/admin/access-requests/[requestId]/reject/route";
import { PUT as settingsRoute } from "@/app/api/admin/settings/[section]/route";
import { POST as projectsCreate } from "@/app/api/admin/projects/route";
import { PUT as locationRoute } from "@/app/api/admin/projects/[projectId]/locations/route";
import { POST as structureCreate } from "@/app/api/admin/locations/[locationId]/structure/route";
import { GET as auditRoute } from "@/app/api/admin/audit/route";
import { GET as dashboardRoute } from "@/app/api/admin/dashboard/route";
import { params, readJson, req, seedScenario, sessionFor, type Scenario } from "../support/fixtures";

let s: Scenario;
let admin: { token: string; csrf: string };
beforeEach(async () => {
  s = await seedScenario();
  admin = await sessionFor(s.admin.id);
});

const newContractor = { fullName: "Laura Contratista", email: "Documentos@NuevaConstructora.example", phone: "+57 300 000 0000", newCompanyName: "Nueva Constructora", roleKey: "CONTRACTOR", identityType: "GUEST" };

describe("ADMINISTRACIÓN: contratistas", () => {
  it("crea un contratista, autoriza su correo y asigna proyectos", async () => {
    const r = await readJson<{ user: { id: string; email: string; status: string }; authorization: { status: string; invitation: { demo: boolean } } }>(
      await createUserRoute(req("POST", "/api/admin/users", { session: admin, json: { ...newContractor, projectIds: [s.A.id], authorizeNow: true } }), {}),
    );
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe("documentos@nuevaconstructora.example");
    expect(r.body.authorization.status).toBe("ACTIVE"); // modo demostración: sin invitación real
    expect(r.body.authorization.invitation.demo).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { id: r.body.user.id }, include: { company: true, projects: true } });
    expect(u).toMatchObject({ fullName: "Laura Contratista", status: "ACTIVE", authorizedById: s.admin.id, roleKey: "CONTRACTOR" });
    expect(u.company?.name).toBe("Nueva Constructora");
    expect(u.projects.map((p) => p.projectId)).toEqual([s.A.id]);
    expect(await db.invitation.count()).toBe(0); // no se simulan invitaciones
    for (const action of ["USER_CREATED", "USER_AUTHORIZED", "COMPANY_CREATED"]) expect(await db.auditLog.count({ where: { action, actorUserId: s.admin.id } })).toBe(1);
    // El nuevo contratista ve solo su proyecto.
    const sess = await sessionFor(u.id);
    const list = await readJson<{ projects: { code: string }[] }>(await listProjects(req("GET", "/api/projects", { session: sess }), {}));
    expect(list.body.projects.map((p) => p.code)).toEqual(["PA"]);
  });

  it("no permite registrar dos veces el mismo correo", async () => {
    const r = await createUserRoute(req("POST", "/api/admin/users", { session: admin, json: { ...newContractor, email: "DOCUMENTOS@constructoraabc.example", projectIds: [] } }), {});
    expect(r.status).toBe(409);
  });

  it("registro sin autorización inmediata queda pendiente y no puede ingresar", async () => {
    const r = await readJson<{ user: { id: string; status: string } }>(await createUserRoute(req("POST", "/api/admin/users", { session: admin, json: { ...newContractor, projectIds: [], authorizeNow: false } }), {}));
    expect(r.body.user.status).toBe("PENDING_APPROVAL");
    const ok = await readJson<{ status: string }>(await authorizeRoute(req("POST", `/api/admin/users/${r.body.user.id}/authorize`, { session: admin }), params({ userId: r.body.user.id })));
    expect(ok.body.status).toBe("ACTIVE");
  });

  it("asignar proyectos cambia lo que ve el contratista y queda auditado", async () => {
    const r = await readJson<{ added: number; removed: number }>(await setProjectsRoute(req("PUT", `/api/admin/users/${s.abcUser.id}/projects`, { session: admin, json: { projectIds: [s.C.id, s.A.id] } }), params({ userId: s.abcUser.id })));
    expect(r.body).toEqual({ added: 1, removed: 1 });
    const sess = await sessionFor(s.abcUser.id);
    const list = await readJson<{ projects: { code: string }[] }>(await listProjects(req("GET", "/api/projects", { session: sess }), {}));
    expect(list.body.projects.map((p) => p.code).sort()).toEqual(["PA", "PC"]);
    const ev = await db.auditLog.findFirstOrThrow({ where: { action: "USER_PROJECTS_CHANGED" } });
    expect(ev.details).toMatchObject({ added: [s.C.id], removed: [s.B.id] });
  });

  it("suspende y reactiva, exigiendo motivo e invalidando sesiones", async () => {
    const contractorSession = await sessionFor(s.abcUser.id);
    expect((await suspendRoute(req("POST", `/api/admin/users/${s.abcUser.id}/suspend`, { session: admin, json: { reason: "" } }), params({ userId: s.abcUser.id }))).status).toBe(400);
    const r = await readJson<{ status: string; sessionsRevoked: number }>(await suspendRoute(req("POST", `/api/admin/users/${s.abcUser.id}/suspend`, { session: admin, json: { reason: "Fin del contrato" } }), params({ userId: s.abcUser.id })));
    expect(r.body.status).toBe("SUSPENDED");
    expect(r.body.sessionsRevoked).toBeGreaterThanOrEqual(1);
    expect((await listProjects(req("GET", "/api/projects", { session: contractorSession }), {})).status).toBe(401);
    // Sus documentos e historial se conservan.
    expect(await db.user.count({ where: { id: s.abcUser.id } })).toBe(1);
    const back = await readJson<{ status: string }>(await reactivateRoute(req("POST", `/api/admin/users/${s.abcUser.id}/reactivate`, { session: admin, json: { reason: "Nuevo contrato" } }), params({ userId: s.abcUser.id })));
    expect(back.body.status).toBe("ACTIVE");
  });

  it("protege contra el bloqueo del sistema (auto-suspensión y último administrador)", async () => {
    expect((await suspendRoute(req("POST", `/api/admin/users/${s.admin.id}/suspend`, { session: admin, json: { reason: "prueba" } }), params({ userId: s.admin.id }))).status).toBe(409);
    expect((await roleRoute(req("PUT", `/api/admin/users/${s.admin.id}/role`, { session: admin, json: { roleKey: "VIEWER" } }), params({ userId: s.admin.id }))).status).toBe(409);
  });

  it("en producción sin configuración de Microsoft, la invitación no se simula: se informa y queda registrada como fallida", async () => {
    const r = await readJson<{ user: { id: string } }>(await createUserRoute(req("POST", "/api/admin/users", { session: admin, json: { ...newContractor, projectIds: [], authorizeNow: false } }), {}));
    process.env.APP_MODE = "production";
    resetEnvCache();
    try {
      const res = await readJson<{ status: string; invitation: { ok: boolean; message: string } }>(await authorizeRoute(req("POST", `/api/admin/users/${r.body.user.id}/authorize`, { session: admin }), params({ userId: r.body.user.id })));
      expect(res.body.invitation.ok).toBe(false);
      expect(res.body.invitation.message).toMatch(/Falta completar la configuración administrativa/);
      expect(res.body.status).toBe("PENDING_APPROVAL");
      const inv = await db.invitation.findFirstOrThrow({ where: { userId: r.body.user.id } });
      expect(inv.status).toBe("FAILED");
      expect(await db.auditLog.count({ where: { action: "INVITATION_FAILED" } })).toBe(1);
    } finally {
      process.env.APP_MODE = "demo";
      resetEnvCache();
    }
  });
});

describe("ADMINISTRACIÓN: solicitudes de acceso", () => {
  const body = { fullName: "Sofía Solicitante", companyName: "Eléctricas del Valle", email: "sofia@electricas.example", requestedProject: "PB Proyecto B", justification: "Calidad" };

  it("una solicitud pública queda pendiente y nunca crea un usuario automáticamente", async () => {
    const r = await readJson<{ received: boolean; trackingCode: string }>(await publicRequest(req("POST", "/api/access-requests", { json: body }), {}));
    expect(r.status).toBe(202);
    expect(r.body.trackingCode).toHaveLength(20);
    expect(await db.user.count({ where: { email: body.email } })).toBe(0);
    const reqRow = await db.accessRequest.findFirstOrThrow({ where: { email: body.email } });
    expect(reqRow.status).toBe("PENDING");
    expect(reqRow.trackingCodeHash).not.toBe(r.body.trackingCode);
    // El campo trampa anti-bots rechaza envíos automatizados.
    expect((await publicRequest(req("POST", "/api/access-requests", { json: { ...body, website: "spam" } }), {})).status).toBe(400);
  });

  it("flujo de información adicional con código de seguimiento", async () => {
    const r = await readJson<{ trackingCode: string }>(await publicRequest(req("POST", "/api/access-requests", { json: body }), {}));
    const row = await db.accessRequest.findFirstOrThrow({ where: { email: body.email } });
    expect((await infoRoute(req("POST", `/api/admin/access-requests/${row.id}/request-info`, { session: admin, json: { message: "Adjunte el número de contrato." } }), params({ requestId: row.id }))).status).toBe(200);
    const st = await readJson<{ status: string; infoRequestedMessage: string; canRespond: boolean }>(await requestStatus(req("POST", "/api/access-requests/status", { json: { code: r.body.trackingCode } }), {}));
    expect(st.body).toMatchObject({ status: "INFO_REQUESTED", infoRequestedMessage: "Adjunte el número de contrato.", canRespond: true });
    expect((await requestRespond(req("POST", "/api/access-requests/respond", { json: { code: r.body.trackingCode, additionalInfo: "Contrato 123-2026" } }), {})).status).toBe(200);
    expect((await db.accessRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
    expect((await requestStatus(req("POST", "/api/access-requests/status", { json: { code: "codigo-inexistente-123" } }), {})).status).toBe(404);
  });

  it("aprobar exige proyectos explícitos y crea el usuario autorizado; rechazar no crea nada", async () => {
    await publicRequest(req("POST", "/api/access-requests", { json: body }), {});
    const row = await db.accessRequest.findFirstOrThrow({ where: { email: body.email } });
    const noProjects = await approveRoute(req("POST", `/api/admin/access-requests/${row.id}/approve`, { session: admin, json: { fullName: body.fullName, roleKey: "CONTRACTOR", identityType: "GUEST", projectIds: [] } }), params({ requestId: row.id }));
    expect(noProjects.status).toBe(400);
    const ok = await approveRoute(req("POST", `/api/admin/access-requests/${row.id}/approve`, { session: admin, json: { fullName: body.fullName, roleKey: "CONTRACTOR", identityType: "GUEST", projectIds: [s.B.id] } }), params({ requestId: row.id }));
    expect(ok.status).toBe(200);
    const u = await db.user.findUniqueOrThrow({ where: { email: body.email }, include: { projects: true, company: true } });
    expect(u.projects.map((p) => p.projectId)).toEqual([s.B.id]);
    expect(u.company?.name).toBe("Eléctricas del Valle");
    expect((await db.accessRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("APPROVED");
    // Una solicitud resuelta no se puede volver a resolver.
    expect((await rejectRoute(req("POST", `/api/admin/access-requests/${row.id}/reject`, { session: admin, json: { notes: "tarde" } }), params({ requestId: row.id }))).status).toBe(409);

    await publicRequest(req("POST", "/api/access-requests", { json: { ...body, email: "otro@x.example" } }), {});
    const r2 = await db.accessRequest.findFirstOrThrow({ where: { email: "otro@x.example" } });
    expect((await rejectRoute(req("POST", `/api/admin/access-requests/${r2.id}/reject`, { session: admin, json: { notes: "Sin contrato vigente" } }), params({ requestId: r2.id }))).status).toBe(200);
    expect(await db.user.count({ where: { email: "otro@x.example" } })).toBe(0);
  });
});

describe("ADMINISTRACIÓN: proyectos, estructura, configuración y auditoría", () => {
  it("asocia una carpeta real como ubicación y verifica su estructura sin modificarla", async () => {
    const p = await readJson<{ id: string }>(await projectsCreate(req("POST", "/api/admin/projects", { session: admin, json: { code: "PN", name: "Proyecto nuevo" } }), {}));
    const before = await db.demoDriveItem.count();
    const r = await readJson<{ report: { stages: { key: string; status: string }[] } }>(await locationRoute(req("PUT", `/api/admin/projects/${p.body.id}/locations`, { session: admin, json: { driveItemId: s.B.rootId } }), params({ projectId: p.body.id })));
    expect(r.status).toBe(200);
    expect(r.body.report.stages.map((x) => [x.key, x.status])).toEqual([["inicio", "found"], ["ejecucion", "found"], ["cierre", "found"]]);
    expect(await db.demoDriveItem.count()).toBe(before); // nada se creó en el almacenamiento
    // Una ruta escrita a mano o un identificador inexistente no se acepta.
    expect((await locationRoute(req("PUT", `/api/admin/projects/${p.body.id}/locations`, { session: admin, json: { driveItemId: "/sites/x/inventado" } }), params({ projectId: p.body.id }))).status).toBe(404);
  });

  it("crear una carpeta de estructura faltante exige confirmar la ruta exacta y no duplica", async () => {
    await db.demoDriveItem.delete({ where: { id: s.A.dossier } });
    const path = "/PA Proyecto A/3. Cierre/Dossier";
    const wrong = await structureCreate(req("POST", `/api/admin/locations/${s.A.locationId}/structure`, { session: admin, json: { stageKey: "cierre", subfolderName: "Dossier", confirmPath: "/otra" } }), params({ locationId: s.A.locationId }));
    expect(wrong.status).toBe(400);
    const ok = await structureCreate(req("POST", `/api/admin/locations/${s.A.locationId}/structure`, { session: admin, json: { stageKey: "cierre", subfolderName: "Dossier", confirmPath: path } }), params({ locationId: s.A.locationId }));
    expect(ok.status).toBe(200);
    const again = await structureCreate(req("POST", `/api/admin/locations/${s.A.locationId}/structure`, { session: admin, json: { stageKey: "cierre", subfolderName: "Dossier", confirmPath: path } }), params({ locationId: s.A.locationId }));
    expect(again.status).toBe(409);
    expect(await db.demoDriveItem.count({ where: { parentId: s.A.cierre, nameLower: "dossier" } })).toBe(1);
  });

  it("la configuración se valida en el servidor y queda auditada", async () => {
    const bad = await settingsRoute(req("PUT", "/api/admin/settings/uploads", { session: admin, json: { maxFileSizeMB: 10, maxFilesPerOperation: 5, allowedExtensions: ["pdf"], chunkSizeKB: 1000, simpleUploadMaxMB: 4, maxRetries: 3, parallelUploads: 2, allowContractorReplace: false } }), params({ section: "uploads" }));
    expect(bad.status).toBe(400);
    const ok = await settingsRoute(req("PUT", "/api/admin/settings/branding", { session: admin, json: { portalName: "Portal Documental IMA", subtitle: "x", organizationName: "Org", supportEmail: "", accentColor: "#123B6D" } }), params({ section: "branding" }));
    expect(ok.status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "SETTINGS_UPDATED" } })).toBe(1);
  });

  it("la auditoría es de solo lectura incluso a nivel de base de datos", async () => {
    await suspendRoute(req("POST", `/api/admin/users/${s.abcUser.id}/suspend`, { session: admin, json: { reason: "Prueba" } }), params({ userId: s.abcUser.id }));
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "USER_SUSPENDED" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "MANIPULADO" } })).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    const list = await readJson<{ rows: { action: string }[] }>(await auditRoute(req("GET", "/api/admin/audit?category=USERS", { session: admin }), {}));
    expect(list.body.rows.some((r) => r.action === "USER_SUSPENDED")).toBe(true);
  });

  it("el panel calcula los indicadores desde datos reales", async () => {
    await publicRequest(req("POST", "/api/access-requests", { json: { fullName: "Uno Dos", companyName: "Empresa", email: "u@d.example", requestedProject: "PA" } }), {});
    const d = await readJson<{ activeContractors: number; pendingRequests: number; projects: number; uploaded: number; uploadErrors: number }>(await dashboardRoute(req("GET", "/api/admin/dashboard", { session: admin }), {}));
    expect(d.body).toMatchObject({ activeContractors: 2, pendingRequests: 1, projects: 3, uploaded: 0, uploadErrors: 0 });
  });
});
