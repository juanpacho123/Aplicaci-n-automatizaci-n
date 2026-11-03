import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { invalidateSettingsCache } from "@/lib/services/settings.service";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { DEMO_DRIVE_ID, DEMO_ROOT_ID } from "@/lib/storage/demo-provider";

const APP = "http://localhost:3999";

/** Vacía la base de datos de pruebas (excepto roles). Usa la vía de depuración controlada de la auditoría. */
export async function resetDb() {
  await db.$transaction([
    db.$executeRawUnsafe("SET LOCAL app.audit_purge = 'on'"),
    db.$executeRawUnsafe("DELETE FROM audit_logs"),
    db.$executeRawUnsafe(
      "TRUNCATE uploaded_files, upload_operations, folder_operations, project_stage_folders, project_locations, user_projects, invitations, sessions, token_caches, access_requests, users, companies, projects, demo_upload_sessions, demo_drive_items, system_settings CASCADE",
    ),
  ]);
  invalidateSettingsCache();
  resetRateLimits();
  await rm(path.resolve(process.env.DEMO_STORAGE_DIR!), { recursive: true, force: true });
}

async function folder(parentId: string | null, name: string, id: string = randomUUID()) {
  await db.demoDriveItem.create({ data: { id, driveId: DEMO_DRIVE_ID, parentId, name, nameLower: name.toLocaleLowerCase("es"), isFolder: true, createdByName: "fixture" } });
  return id;
}

export type ProjectFixture = { id: string; code: string; rootId: string; inicio: string; ejecucion: string; cierre: string; seguimiento: string; planos: string; dossier: string; locationId: string };

async function project(code: string, name: string): Promise<ProjectFixture> {
  const rootId = await folder(DEMO_ROOT_ID, `${code} ${name}`);
  const inicio = await folder(rootId, "1. Inicio");
  const ejecucion = await folder(rootId, "2. Ejecución");
  const seguimiento = await folder(ejecucion, "2.06 Seguimiento");
  const planos = await folder(ejecucion, "2.07 Planos");
  const cierre = await folder(rootId, "3. Cierre");
  const dossier = await folder(cierre, "Dossier");
  const p = await db.project.create({ data: { code, name } });
  const loc = await db.projectLocation.create({ data: { projectId: p.id, siteId: "demo-site", driveId: DEMO_DRIVE_ID, rootItemId: rootId, rootName: `${code} ${name}`, rootPath: `/${code} ${name}` } });
  await db.projectStageFolder.createMany({
    data: [
      { locationId: loc.id, stageKey: "inicio", driveItemId: inicio, name: "1. Inicio", path: "" },
      { locationId: loc.id, stageKey: "ejecucion", driveItemId: ejecucion, name: "2. Ejecución", path: "" },
      { locationId: loc.id, stageKey: "cierre", driveItemId: cierre, name: "3. Cierre", path: "" },
    ],
  });
  return { id: p.id, code, rootId, inicio, ejecucion, cierre, seguimiento, planos, dossier, locationId: loc.id };
}

/** Escenario base: dos empresas, tres proyectos y usuarios con distintos roles y estados. */
export async function seedScenario() {
  await resetDb();
  await db.systemSetting.create({ data: { key: "system.environment", value: "DEMO" } });
  await folder(null, "Biblioteca de pruebas", DEMO_ROOT_ID);
  const A = await project("PA", "Proyecto A");
  const B = await project("PB", "Proyecto B");
  const C = await project("PC", "Proyecto C");
  const abc = await db.company.create({ data: { name: "Constructora ABC" } });
  const xyz = await db.company.create({ data: { name: "Ingeniería XYZ" } });
  const admin = await db.user.create({ data: { email: "admin@test.example", fullName: "Admin Prueba", roleKey: "ADMIN", status: "ACTIVE", identityType: "MEMBER" } });
  const mk = (email: string, fullName: string, companyId: string | null, roleKey: "CONTRACTOR" | "VIEWER", status: "ACTIVE" | "SUSPENDED" | "PENDING_APPROVAL" | "INVITATION_SENT", projectIds: string[]) =>
    db.user.create({ data: { email, fullName, companyId, roleKey, status, identityType: "GUEST", projects: { create: projectIds.map((projectId) => ({ projectId })) } } });
  const abcUser = await mk("documentos@constructoraabc.example", "Carlos ABC", abc.id, "CONTRACTOR", "ACTIVE", [A.id, B.id]);
  const xyzUser = await mk("calidad@ingenieriaxyz.example", "Ana XYZ", xyz.id, "CONTRACTOR", "ACTIVE", [C.id]);
  const viewer = await mk("consulta@test.example", "Pedro Consulta", null, "VIEWER", "ACTIVE", [A.id]);
  const suspended = await mk("suspendido@test.example", "Jorge Suspendido", abc.id, "CONTRACTOR", "SUSPENDED", [A.id]);
  return { A, B, C, abc, xyz, admin, abcUser, xyzUser, viewer, suspended };
}

export type Scenario = Awaited<ReturnType<typeof seedScenario>>;

export async function sessionFor(userId: string) {
  const s = await createSession({ userId, authMethod: "DEMO", request: { ip: "127.0.0.1", userAgent: "vitest" } });
  return { token: s.token, csrf: s.csrfToken };
}

type ReqOpts = { session?: { token: string; csrf: string }; json?: unknown; body?: BodyInit | Uint8Array; headers?: Record<string, string>; csrf?: string | null; origin?: string | null };

/** Construye una NextRequest como la enviaría el navegador del portal. */
export function req(method: string, pathname: string, opts: ReqOpts = {}) {
  const headers = new Headers(opts.headers);
  if (opts.session) headers.set("cookie", `pgd_session=${opts.session.token}`);
  if (method !== "GET") {
    if (opts.origin !== null) headers.set("origin", opts.origin ?? APP);
    const csrf = opts.csrf === undefined ? opts.session?.csrf : opts.csrf;
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  let body = opts.body as BodyInit | undefined;
  if (opts.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.json);
  }
  return new NextRequest(new URL(pathname, APP), { method, headers, body });
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

export async function readJson<T = Record<string, unknown>>(res: Response) {
  return { status: res.status, body: (await res.json()) as T };
}
