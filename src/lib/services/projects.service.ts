import "server-only";
import { db } from "@/lib/db/prisma";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import { getSettings } from "./settings.service";
import { resolveProjectScope } from "./project-scope.service";

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  hasLocation: boolean;
  configuredStages: number;
  totalStages: number;
  lastUploadAt: string | null;
};

/** Proyectos visibles: todos para el administrador; solo los asignados y activos para el resto. */
export async function listAccessibleProjects(ctx: AuthContext): Promise<ProjectSummary[]> {
  await requirePermission(ctx, "project:read");
  const where = ctx.role === "ADMIN" ? {} : { status: "ACTIVE" as const, members: { some: { userId: ctx.user.id } } };
  const [projects, settings] = await Promise.all([
    db.project.findMany({ where, orderBy: [{ status: "asc" }, { code: "asc" }], include: { locations: { include: { stageFolders: true } } } }),
    getSettings(),
  ]);
  const lastUploads = await db.uploadOperation.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projects.map((p) => p.id) }, ...(ctx.role === "ADMIN" ? {} : { userId: ctx.user.id }), successCount: { gt: 0 } },
    _max: { createdAt: true },
  });
  const lastMap = new Map(lastUploads.map((l) => [l.projectId, l._max.createdAt?.toISOString() ?? null]));
  return projects.map((p) => {
    const loc = (ctx.user.companyId ? p.locations.find((l) => l.companyId === ctx.user.companyId) : undefined) ?? p.locations.find((l) => l.companyId === null) ?? (ctx.role === "ADMIN" ? p.locations[0] : undefined);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      status: p.status,
      hasLocation: Boolean(loc),
      configuredStages: loc ? loc.stageFolders.length : 0,
      totalStages: settings.structure.stages.length,
      lastUploadAt: lastMap.get(p.id) ?? null,
    };
  });
}

/** Detalle de un proyecto autorizado con sus etapas configuradas. */
export async function projectDetail(ctx: AuthContext, projectId: string, locationId?: string | null) {
  await requirePermission(ctx, "project:read");
  const scope = await resolveProjectScope(ctx, projectId, { requireLocation: false, locationId: locationId ?? null });
  const loc = scope.location;
  return {
    project: { id: scope.project.id, code: scope.project.code, name: scope.project.name, description: scope.project.description, status: scope.project.status },
    location: loc ? { id: loc.id, rootName: loc.rootName, rootPath: loc.rootPath, webUrl: loc.webUrl, companyName: loc.company?.name ?? null } : null,
    stages: scope.stages.map((s) => {
      const mapped = loc?.stageFolders.find((sf) => sf.stageKey === s.key);
      return { key: s.key, label: s.label, order: s.order, folderId: mapped?.driveItemId ?? null, folderName: mapped?.name ?? null, available: Boolean(mapped) };
    }),
  };
}
