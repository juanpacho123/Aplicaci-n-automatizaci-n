import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { env, isDemoMode, microsoftConfigStatus } from "@/lib/config/env";
import { AppError, Errors } from "@/lib/http/errors";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import { configuredLibrary, graphClientFor, storageFor } from "@/lib/storage";
import { driveMatchesLibraryUrl, getDrive, getSite, listSiteDrives, resolveSiteByPath } from "@/lib/graph/sites";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit.service";
import { verifyLocationStructure } from "./structure.service";

export const ProjectSchema = z.object({
  code: z.string().trim().min(2, "Ingrese el código").max(40).regex(/^[A-Za-z0-9._\-\s]+$/, "Use letras, números, guiones o puntos"),
  name: z.string().trim().min(3, "Ingrese el nombre").max(160),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export const SetLocationSchema = z.object({
  driveItemId: z.string().min(1).max(200),
  companyId: z.string().uuid().nullable().optional(),
});

export async function listProjectsAdmin(ctx: AuthContext, q?: string) {
  await requirePermission(ctx, "projects:manage");
  return db.project.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: [{ status: "asc" }, { code: "asc" }],
    include: { _count: { select: { members: true, uploadOperations: true } }, locations: { include: { company: true, stageFolders: true } } },
  });
}

export async function createProject(ctx: AuthContext, input: z.infer<typeof ProjectSchema>) {
  await requirePermission(ctx, "projects:manage");
  try {
    const p = await db.project.create({ data: { ...input, createdById: ctx.user.id } });
    await audit({ actor: ctx.actor, action: "PROJECT_CREATED", category: "PROJECTS", result: "SUCCESS", projectId: p.id, projectCode: p.code, targetType: "project", targetId: p.id, details: input });
    return p;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("Ya existe un proyecto con ese código.");
    throw e;
  }
}

export async function updateProject(ctx: AuthContext, projectId: string, input: z.infer<typeof ProjectSchema>) {
  await requirePermission(ctx, "projects:manage");
  const before = await db.project.findUnique({ where: { id: projectId } });
  if (!before) throw Errors.notFound("El proyecto no existe.");
  try {
    const p = await db.project.update({ where: { id: projectId }, data: input });
    await audit({ actor: ctx.actor, action: "PROJECT_UPDATED", category: "PROJECTS", result: "SUCCESS", projectId: p.id, projectCode: p.code, targetType: "project", targetId: p.id, details: { before: { code: before.code, name: before.name, status: before.status }, after: input } });
    return p;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("Ya existe un proyecto con ese código.");
    throw e;
  }
}

export async function projectAdminDetail(ctx: AuthContext, projectId: string) {
  await requirePermission(ctx, "projects:manage");
  if (!z.string().uuid().safeParse(projectId).success) throw Errors.notFound("El proyecto no existe.");
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      locations: { include: { company: true, stageFolders: true }, orderBy: { createdAt: "asc" } },
      members: { include: { user: { include: { company: true } }, grantedBy: { select: { fullName: true } } }, orderBy: { grantedAt: "desc" } },
    },
  });
  if (!project) throw Errors.notFound("El proyecto no existe.");
  const [uploads, folders] = await Promise.all([
    db.uploadOperation.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { fullName: true } } } }),
    db.folderOperation.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { fullName: true } } } }),
  ]);
  return { project, uploads, folders };
}

/**
 * Asocia una carpeta REAL de la biblioteca configurada como ubicación del proyecto.
 * El identificador se valida contra SharePoint; no se aceptan rutas escritas a mano.
 * No modifica nada en SharePoint. Tras asociarla, se verifica la estructura (lectura).
 */
export async function setProjectLocation(ctx: AuthContext, projectId: string, input: z.infer<typeof SetLocationSchema>) {
  await requirePermission(ctx, "projects:manage");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw Errors.notFound("El proyecto no existe.");
  if (input.companyId && !(await db.company.findUnique({ where: { id: input.companyId } }))) throw Errors.validation("La empresa no existe.");
  const library = configuredLibrary();
  const storage = storageFor(ctx);
  const item = await storage.getItem(library.driveId, input.driveItemId);
  if (!item.isFolder) throw Errors.validation("La ubicación debe ser una carpeta.");
  if (item.parentId === null) throw Errors.validation("Seleccione la carpeta del proyecto, no la raíz de la biblioteca.");
  const rootPath = storage.fullPath(item);
  const companyId = input.companyId ?? null;
  const existing = await db.projectLocation.findFirst({ where: { projectId, companyId } });
  const data = { siteId: library.siteId, driveId: library.driveId, rootItemId: item.id, rootName: item.name, rootPath, webUrl: item.webUrl, createdById: ctx.user.id };
  const location = existing
    ? await db.projectLocation.update({ where: { id: existing.id }, data: { ...data, verifiedAt: null, stageFolders: { deleteMany: {} } } })
    : await db.projectLocation.create({ data: { ...data, projectId, companyId } });
  await audit({
    actor: ctx.actor,
    action: "PROJECT_LOCATION_SET",
    category: "PROJECTS",
    result: "SUCCESS",
    projectId,
    projectCode: project.code,
    targetType: "location",
    targetId: location.id,
    folderPath: rootPath,
    details: { driveItemId: item.id, companyId, previous: existing ? { rootItemId: existing.rootItemId, rootPath: existing.rootPath } : null },
  });
  const report = await verifyLocationStructure(ctx, location.id);
  return { location, report };
}

export async function removeProjectLocation(ctx: AuthContext, locationId: string) {
  await requirePermission(ctx, "projects:manage");
  const loc = await db.projectLocation.findUnique({ where: { id: locationId }, include: { project: true } });
  if (!loc) throw Errors.notFound("La ubicación no existe.");
  await db.projectLocation.delete({ where: { id: locationId } });
  await audit({ actor: ctx.actor, action: "PROJECT_LOCATION_REMOVED", category: "PROJECTS", result: "SUCCESS", projectId: loc.projectId, projectCode: loc.project.code, targetType: "location", targetId: locationId, folderPath: loc.rootPath, details: { note: "Solo se eliminó la asociación en el portal; SharePoint no se modificó." } });
  return { removed: true };
}

/** Explorador de solo lectura de la biblioteca configurada (selector de ubicaciones). */
export async function browseLibrary(ctx: AuthContext, itemId?: string | null) {
  await requirePermission(ctx, "projects:manage");
  const library = configuredLibrary();
  const storage = storageFor(ctx);
  const rootId = isDemoMode() ? "demo-root" : "root";
  const current = await storage.getItem(library.driveId, itemId || rootId);
  if (!current.isFolder) throw Errors.validation("El elemento no es una carpeta.");
  const children = (await storage.listChildren(library.driveId, current.id)).filter((c) => c.isFolder);
  const linked = await db.projectLocation.findMany({ where: { driveId: library.driveId, rootItemId: { in: children.map((c) => c.id) } }, include: { project: true, company: true } });
  return {
    current: { id: current.id, name: current.name || "Biblioteca", path: storage.fullPath(current), parentId: current.parentId, webUrl: current.webUrl },
    folders: children.map((c) => ({
      id: c.id,
      name: c.name,
      childCount: c.childCount,
      modifiedAt: c.modifiedAt,
      linkedTo: linked.filter((l) => l.rootItemId === c.id).map((l) => ({ projectCode: l.project.code, company: l.company?.name ?? null })),
    })),
    storage: storage.kind,
  };
}

/**
 * Diagnóstico de la conexión con SharePoint (solo lectura): resuelve el sitio por URL,
 * lista bibliotecas y comprueba el acceso a SHAREPOINT_SITE_ID / SHAREPOINT_DRIVE_ID.
 */
export async function sharePointDiagnostics(ctx: AuthContext) {
  await requirePermission(ctx, "settings:manage");
  const config = microsoftConfigStatus();
  if (isDemoMode()) return { mode: "demo" as const, config, steps: [] as DiagnosticStep[] };
  const e = env();
  const graph = graphClientFor(ctx, "files");
  const steps: DiagnosticStep[] = [];
  const run = async (label: string, fn: () => Promise<string>) => {
    try {
      steps.push({ label, ok: true, detail: await fn() });
    } catch (err) {
      steps.push({ label, ok: false, detail: err instanceof AppError ? err.message : "Error inesperado" });
    }
  };
  if (e.SHAREPOINT_HOSTNAME && e.SHAREPOINT_SITE_PATH) {
    await run(`Resolver sitio ${e.SHAREPOINT_HOSTNAME}${e.SHAREPOINT_SITE_PATH}`, async () => {
      const site = await resolveSiteByPath(graph, e.SHAREPOINT_HOSTNAME!, e.SHAREPOINT_SITE_PATH!);
      const drives = await listSiteDrives(graph, site.id);
      const match = e.SHAREPOINT_LIBRARY_URL ? drives.find((d) => driveMatchesLibraryUrl(d, e.SHAREPOINT_LIBRARY_URL!)) : undefined;
      return `Site ID: ${site.id} · Bibliotecas: ${drives.map((d) => d.name).join(", ")}${match ? ` · Biblioteca configurada → Drive ID: ${match.id}` : ""}`;
    });
  }
  if (e.SHAREPOINT_SITE_ID) await run("Acceso al sitio configurado (SHAREPOINT_SITE_ID)", async () => (await getSite(graph, e.SHAREPOINT_SITE_ID!)).webUrl);
  if (e.SHAREPOINT_DRIVE_ID) await run("Acceso a la biblioteca configurada (SHAREPOINT_DRIVE_ID)", async () => {
    const d = await getDrive(graph, e.SHAREPOINT_DRIVE_ID!);
    return `${d.name} · ${d.webUrl}`;
  });
  return { mode: "production" as const, config, steps };
}

export type DiagnosticStep = { label: string; ok: boolean; detail: string };
