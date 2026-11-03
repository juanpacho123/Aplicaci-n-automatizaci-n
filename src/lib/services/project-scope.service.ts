import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { Errors } from "@/lib/http/errors";
import { audit } from "./audit.service";
import { getSettings } from "./settings.service";
import type { AuthContext } from "@/lib/authz/guards";
import type { StorageProvider, DriveItem } from "@/lib/storage/types";
import type { StageDefinition } from "@/lib/validation/settings-schema";
import { canonicalFolderKey } from "@/lib/validation/names";

const uuid = z.string().uuid();

export type ProjectScope = Awaited<ReturnType<typeof resolveProjectScope>>;

/**
 * Resuelve el proyecto y la ubicación de SharePoint efectiva para el usuario.
 * - Administrador: cualquier proyecto (y cualquier ubicación si indica locationId).
 * - Contratista / Consulta: solo proyectos ACTIVOS asignados en user_projects.
 * - Ubicación: la específica de la empresa del usuario si existe; si no, la compartida.
 * Nunca se confía en que el proyecto "aparece en el frontend".
 */
export async function resolveProjectScope(ctx: AuthContext, projectId: string, opts: { locationId?: string | null; requireLocation?: boolean } = {}) {
  if (!uuid.safeParse(projectId).success) throw Errors.notFound("El proyecto no existe.");
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { locations: { include: { stageFolders: true, company: true } } },
  });

  const deny = async (reason: string) => {
    await audit({ actor: ctx.actor, action: "ACCESS_DENIED", category: "SECURITY", result: "DENIED", projectId: project?.id ?? null, targetType: "project", targetId: projectId, details: { reason } });
    return Errors.forbidden("No tiene acceso a este proyecto.");
  };

  if (!project) {
    if (ctx.role === "ADMIN") throw Errors.notFound("El proyecto no existe.");
    throw await deny("project_not_found");
  }

  if (ctx.role !== "ADMIN") {
    const membership = await db.userProject.findUnique({ where: { userId_projectId: { userId: ctx.user.id, projectId } } });
    if (!membership) throw await deny("not_assigned");
    if (project.status !== "ACTIVE") throw await deny("project_archived");
  }

  let location = null as (typeof project.locations)[number] | null;
  if (opts.locationId) {
    if (ctx.role !== "ADMIN") throw await deny("location_override_not_allowed");
    location = project.locations.find((l) => l.id === opts.locationId) ?? null;
    if (!location) throw Errors.notFound("La ubicación indicada no pertenece al proyecto.");
  } else {
    const companyId = ctx.user.companyId;
    location =
      (companyId ? project.locations.find((l) => l.companyId === companyId) : undefined) ??
      project.locations.find((l) => l.companyId === null) ??
      (ctx.role === "ADMIN" ? project.locations[0] : undefined) ??
      null;
  }
  if (!location && opts.requireLocation !== false) {
    throw Errors.configMissing(`ubicación de SharePoint del proyecto «${project.name}» (el administrador debe asociarla en Proyectos)`);
  }

  const settings = await getSettings();
  const stages = [...settings.structure.stages].sort((a, b) => a.order - b.order);
  return { project, location, stages, settings };
}

export type LocatedScope = ProjectScope & { location: NonNullable<ProjectScope["location"]> };

export function requireLocated(scope: ProjectScope): LocatedScope {
  if (!scope.location) throw Errors.configMissing("ubicación de SharePoint del proyecto");
  return scope as LocatedScope;
}

/**
 * Verifica que itemId esté dentro de la ubicación del proyecto y devuelve la cadena
 * desde la raíz de la ubicación. Rechaza rutas/identificadores manipulados.
 */
export async function folderChain(ctx: AuthContext, scope: LocatedScope, storage: StorageProvider, itemId: string): Promise<DriveItem[]> {
  if (typeof itemId !== "string" || itemId.length === 0 || itemId.length > 200 || /[\s/\\?#]/.test(itemId)) {
    throw Errors.validation("Identificador de carpeta no válido.");
  }
  const loc = scope.location;
  let chain: DriveItem[];
  try {
    chain = await storage.ancestry(loc.driveId, itemId, loc.rootItemId, scope.settings.structure.maxFolderDepth + 1);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "FORBIDDEN" || code === "SHAREPOINT_NOT_FOUND") {
      await audit({
        actor: ctx.actor,
        action: "ACCESS_DENIED",
        category: "SECURITY",
        result: "DENIED",
        projectId: scope.project.id,
        projectCode: scope.project.code,
        targetType: "folder",
        targetId: itemId,
        details: { reason: "folder_out_of_scope" },
      });
      throw Errors.forbidden("La carpeta indicada no pertenece a un proyecto autorizado.");
    }
    throw err;
  }
  const target = chain[chain.length - 1];
  if (!target?.isFolder) throw Errors.validation("El destino seleccionado no es una carpeta.");
  return chain;
}

/** Etapa a la que pertenece una carpeta (según la carpeta de primer nivel de la cadena). */
export function stageForChain(scope: LocatedScope, chain: DriveItem[]): StageDefinition | null {
  const first = chain[1];
  if (!first) return null;
  const mapped = scope.location.stageFolders.find((sf) => sf.driveItemId === first.id);
  return mapped ? scope.stages.find((s) => s.key === mapped.stageKey) ?? null : null;
}

/**
 * Carpetas protegidas (estructura principal): raíz de la ubicación, carpetas de etapa
 * y subcarpetas iniciales esperadas de cada etapa. No se renombran ni eliminan.
 */
export function isProtectedFolder(scope: LocatedScope, chain: DriveItem[]): boolean {
  const item = chain[chain.length - 1];
  if (!item) return true;
  if (item.id === scope.location.rootItemId) return true;
  if (scope.location.stageFolders.some((sf) => sf.driveItemId === item.id)) return true;
  if (chain.length === 3) {
    const stage = stageForChain(scope, chain);
    if (stage && stage.expectedSubfolders.some((n) => canonicalFolderKey(n) === canonicalFolderKey(item.name))) return true;
  }
  return false;
}

export function relativePath(chain: DriveItem[]): string {
  return chain
    .slice(1)
    .map((c) => c.name)
    .join(" / ");
}
