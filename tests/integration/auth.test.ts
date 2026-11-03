import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/prisma";
import { resolveIdentity } from "@/lib/auth/identity.service";
import { validateSessionToken } from "@/lib/auth/session";
import { GET as listProjects } from "@/app/api/projects/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as demoLogin } from "@/app/api/auth/demo-login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as createFolderRoute } from "@/app/api/projects/[projectId]/folders/route";
import { suspendUser } from "@/lib/services/users.service";
import { params, readJson, req, seedScenario, sessionFor, type Scenario } from "../support/fixtures";

const TENANT = "11111111-2222-3333-4444-555555555555";
const info = { ip: "127.0.0.1", userAgent: "vitest" };
let s: Scenario;

beforeEach(async () => {
  s = await seedScenario();
});

describe("AUTENTICACIÓN: vinculación de identidad Microsoft Entra ID", () => {
  it("usuario autorizado puede ingresar (primer acceso vincula tid/oid y luego se exige el mismo)", async () => {
    const r = await resolveIdentity({ tid: TENANT, oid: "oid-abc", emails: ["documentos@constructoraabc.example"], isGuest: true }, TENANT, info);
    expect(r.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { id: s.abcUser.id } });
    expect(u.entraObjectId).toBe("oid-abc");
    expect(u.entraTenantId).toBe(TENANT);
    // Segundo acceso: se identifica por oid aunque el correo del token cambie.
    const again = await resolveIdentity({ tid: TENANT, oid: "oid-abc", emails: [] }, TENANT, info);
    expect(again.ok && again.user.id).toBe(s.abcUser.id);
    const bound = await db.auditLog.count({ where: { action: "AUTH_IDENTITY_BOUND", targetId: s.abcUser.id } });
    expect(bound).toBe(1);
  });

  it("usuario no autorizado no puede ingresar", async () => {
    const r = await resolveIdentity({ tid: TENANT, oid: "oid-x", emails: ["desconocido@otra.example"] }, TENANT, info);
    expect(r).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(await db.auditLog.count({ where: { action: "AUTH_LOGIN_DENIED" } })).toBe(1);
  });

  it("usuario suspendido no puede ingresar", async () => {
    const r = await resolveIdentity({ tid: TENANT, oid: "oid-s", emails: ["suspendido@test.example"] }, TENANT, info);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("SUSPENDED");
  });

  it("una identidad diferente no puede suplantar a otra con el mismo correo", async () => {
    await db.user.update({ where: { id: s.abcUser.id }, data: { entraTenantId: TENANT, entraObjectId: "oid-legitimo" } });
    const r = await resolveIdentity({ tid: TENANT, oid: "oid-atacante", emails: ["documentos@constructoraabc.example"] }, TENANT, info);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("IDENTITY_MISMATCH");
    const ev = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_IDENTITY_MISMATCH" } });
    expect(ev.category).toBe("SECURITY");
    expect(ev.result).toBe("DENIED");
  });

  it("rechaza cuentas de otro inquilino", async () => {
    const r = await resolveIdentity({ tid: "otro-tenant", oid: "x", emails: ["documentos@constructoraabc.example"] }, TENANT, info);
    expect(!r.ok && r.reason).toBe("TENANT_MISMATCH");
  });

  it("rechaza registros pendientes de aprobación y respeta la desactivación del vínculo por correo", async () => {
    await db.user.create({ data: { email: "pendiente@test.example", fullName: "Pendiente", status: "PENDING_APPROVAL" } });
    const r = await resolveIdentity({ tid: TENANT, oid: "o1", emails: ["pendiente@test.example"] }, TENANT, info);
    expect(!r.ok && r.reason).toBe("PENDING_APPROVAL");
    await db.systemSetting.create({ data: { key: "settings.auth", value: { allowFirstLoginEmailBinding: false } } });
    (await import("@/lib/services/settings.service")).invalidateSettingsCache();
    const r2 = await resolveIdentity({ tid: TENANT, oid: "o2", emails: ["calidad@ingenieriaxyz.example"] }, TENANT, info);
    expect(!r2.ok && r2.reason).toBe("BINDING_DISABLED");
  });

  it("la invitación aceptada activa al usuario con el oid fijado en la invitación", async () => {
    const invited = await db.user.create({
      data: { email: "nuevo@contratista.example", fullName: "Nuevo", status: "INVITATION_SENT", identityType: "GUEST", entraTenantId: TENANT, entraObjectId: "oid-invitado" },
    });
    await db.invitation.create({ data: { userId: invited.id, invitedById: s.admin.id, invitedEmail: invited.email, status: "SENT", redirectUrl: "x" } });
    const r = await resolveIdentity({ tid: TENANT, oid: "oid-invitado", emails: ["nuevo@contratista.example"] }, TENANT, info);
    expect(r.ok && r.activated).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: invited.id } })).status).toBe("ACTIVE");
    expect((await db.invitation.findFirstOrThrow({ where: { userId: invited.id } })).status).toBe("REDEEMED");
  });
});

describe("AUTENTICACIÓN: sesiones y protección de la API", () => {
  it("sin autenticación la API responde 401", async () => {
    const r = await readJson(await listProjects(req("GET", "/api/projects"), {}));
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("un token de sesión inventado no es válido", async () => {
    const r = await listProjects(req("GET", "/api/projects", { session: { token: "x".repeat(43), csrf: "y" } }), {});
    expect(r.status).toBe(401);
  });

  it("operaciones con efectos exigen token CSRF y mismo origen", async () => {
    const session = await sessionFor(s.abcUser.id);
    const body = { parentItemId: s.A.seguimiento, name: "Nueva" };
    const noCsrf = await createFolderRoute(req("POST", `/api/projects/${s.A.id}/folders`, { session, json: body, csrf: null }), params({ projectId: s.A.id }));
    expect(noCsrf.status).toBe(403);
    const badOrigin = await createFolderRoute(req("POST", `/api/projects/${s.A.id}/folders`, { session, json: body, origin: "https://malicioso.example" }), params({ projectId: s.A.id }));
    expect(badOrigin.status).toBe(403);
    const ok = await createFolderRoute(req("POST", `/api/projects/${s.A.id}/folders`, { session, json: body }), params({ projectId: s.A.id }));
    expect(ok.status).toBe(201);
  });

  it("un usuario suspendido no puede operar y sus sesiones se invalidan", async () => {
    const session = await sessionFor(s.abcUser.id);
    expect((await me(req("GET", "/api/auth/me", { session }), {})).status).toBe(200);
    const adminSession = await validateSessionToken((await sessionFor(s.admin.id)).token);
    const { buildTestContext } = await import("../support/context");
    await suspendUser(await buildTestContext(adminSession!), s.abcUser.id, "Contrato finalizado");
    const after = await readJson(await me(req("GET", "/api/auth/me", { session }), {}));
    expect(after.status).toBe(401);
    expect(await db.session.count({ where: { userId: s.abcUser.id, revokedAt: null } })).toBe(0);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "USER_SUSPENDED" } });
    expect(audit.actorUserId).toBe(s.admin.id);
  });

  it("si el estado cambia por fuera, la siguiente solicitud se bloquea (USER_NOT_ACTIVE)", async () => {
    const session = await sessionFor(s.abcUser.id);
    await db.user.update({ where: { id: s.abcUser.id }, data: { status: "SUSPENDED" } });
    const r = await readJson(await listProjects(req("GET", "/api/projects", { session }), {}));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "USER_NOT_ACTIVE" } });
    expect(await db.session.count({ where: { userId: s.abcUser.id, revokedAt: null } })).toBe(0);
  });

  it("el acceso de demostración rechaza usuarios suspendidos o pendientes", async () => {
    const form = new FormData();
    form.set("userId", s.suspended.id);
    const res = await demoLogin(req("POST", "/api/auth/demo-login", { body: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/acceso-denegado?motivo=SUSPENDED");
    const ok = new FormData();
    ok.set("userId", s.abcUser.id);
    const res2 = await demoLogin(req("POST", "/api/auth/demo-login", { body: ok }));
    expect(res2.headers.get("location")).toContain("/inicio");
    expect(res2.headers.get("set-cookie")).toMatch(/pgd_session=.+HttpOnly/i);
  });

  it("cerrar sesión revoca la sesión", async () => {
    const session = await sessionFor(s.abcUser.id);
    const r = await logout(req("POST", "/api/auth/logout", { session }));
    expect(r.status).toBe(200);
    expect((await me(req("GET", "/api/auth/me", { session }), {})).status).toBe(401);
    expect(await db.auditLog.count({ where: { action: "AUTH_LOGOUT" } })).toBe(1);
  });
});
