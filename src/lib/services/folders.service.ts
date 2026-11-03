import "server-only";
import { db } from "@/lib/db/prisma";
import { dataEnvironment } from "@/lib/config/env";
import { AppError, Errors } from "@/lib/http/errors";
import { can } from "@/lib/authz/policy";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import { storageFor } from "@/lib/storage";
import type { DriveItem, StorageProvider } from "@/lib/storage/types";
import { sameName, validateItemName } from "@/lib/validation/names";
import { audit } from "./audit.service";
import { folderChain, isProtectedFolder, relativePath, requireLocated, resolveProjectScope, stageForChain, type LocatedScope } from "./project-scope.service";

export type FolderEntry = {
  id: string;
  name: string;
  isFolder: boolean;
  size: number;
  mimeType: string | null;
  webUrl: string | null;
  modifiedAt: string | null;
  createdAt: string | null;
  createdBy: string | null;
  childCount: number | null;
  isProtected: boolean;
  createdInPortal: { by: string; at: string } | null;
};

export type FolderView = {
  project: { id: string; code: string; name: string };
  location: { id: string; rootName: string; rootPath: string; companyName: string | null };
  folder: { id: string; name: string; webUrl: string | null; isRoot: boolean; isProtected: boolean };
  stage: { key: string; label: string } | null;
  breadcrumbs: { id: string; name: string }[];
  fullPath: string;
  relativePath: string;
  children: FolderEntry[];
  capabilities: { canUpload: boolean; canCreateFolder: boolean; canManage: boolean };
  storage: "demo" | "sharepoint";
};

function canCreateHere(ctx: AuthContext, scope: LocatedScope, chain: DriveItem[]): boolean {
  if (!can(ctx.role, "folder:create")) return false;
  if (ctx.role === "ADMIN") return true;
  const stage = stageForChain(scope, chain);
  if (!stage) return false; // Fuera de una etapa: solo el administrador.
  if (chain.length === 2 && !scope.settings.structure.contractorsCanCreateAtStageRoot) return false;
  return chain.length - 1 < scope.settings.structure.maxFolderDepth;
}

function canUploadHere(ctx: AuthContext, scope: LocatedScope, chain: DriveItem[]): boolean {
  return can(ctx.role, "document:upload") && stageForChain(scope, chain) !== null;
}

async function portalCreations(driveItemIds: string[]) {
  if (driveItemIds.length === 0) return new Map<string, { by: string; at: string }>();
  const ops = await db.folderOperation.findMany({
    where: { type: "CREATE", result: "SUCCESS", driveItemId: { in: driveItemIds } },
    include: { user: { select: { fullName: true } } },
  });
  return new Map(ops.map((o) => [o.driveItemId!, { by: o.user.fullName, at: o.createdAt.toISOString() }]));
}

/** Contenido de una carpeta autorizada (o de la raíz de la ubicación si no se indica). */
export async function browseFolder(ctx: AuthContext, input: { projectId: string; itemId?: string | null; locationId?: string | null }): Promise<FolderView> {
  await requirePermission(ctx, "folder:read");
  const scope = requireLocated(await resolveProjectScope(ctx, input.projectId, { locationId: input.locationId }));
  const storage = storageFor(ctx);
  const chain = await folderChain(ctx, scope, storage, input.itemId || scope.location.rootItemId);
  const folder = chain[chain.length - 1];
  const children = await storage.listChildren(scope.location.driveId, folder.id);
  const created = await portalCreations(children.filter((c) => c.isFolder).map((c) => c.id));
  const stage = stageForChain(scope, chain);
  const showFiles = can(ctx.role, "document:read");

  return {
    project: { id: scope.project.id, code: scope.project.code, name: scope.project.name },
    location: { id: scope.location.id, rootName: scope.location.rootName, rootPath: scope.location.rootPath, companyName: scope.location.company?.name ?? null },
    folder: { id: folder.id, name: folder.name, webUrl: folder.webUrl, isRoot: chain.length === 1, isProtected: isProtectedFolder(scope, chain) },
    stage: stage ? { key: stage.key, label: stage.label } : null,
    breadcrumbs: chain.map((c, i) => ({ id: c.id, name: i === 0 ? scope.project.name : c.name })),
    fullPath: storage.fullPath(folder),
    relativePath: relativePath(chain),
    children: children
      .filter((c) => c.isFolder || showFiles)
      .map((c) => ({
        id: c.id,
        name: c.name,
        isFolder: c.isFolder,
        size: c.size,
        mimeType: c.mimeType,
        webUrl: c.webUrl,
        modifiedAt: c.modifiedAt,
        createdAt: c.createdAt,
        createdBy: c.createdBy,
        childCount: c.childCount,
        isProtected: c.isFolder ? isProtectedFolder(scope, [...chain, c]) : false,
        createdInPortal: created.get(c.id) ?? null,
      })),
    capabilities: {
      canUpload: canUploadHere(ctx, scope, chain),
      canCreateFolder: canCreateHere(ctx, scope, chain),
      canManage: ctx.role === "ADMIN",
    },
    storage: storage.kind,
  };
}

async function recordFolderOp(
  ctx: AuthContext,
  scope: LocatedScope,
  data: {
    type: "CREATE" | "RENAME" | "DELETE";
    result: "SUCCESS" | "FAILURE";
    parentItemId: string | null;
    driveItemId: string | null;
    name: string;
    previousName?: string | null;
    path: string;
    stageKey: string | null;
    error?: AppError | null;
  },
) {
  return db.folderOperation.create({
    data: {
      type: data.type,
      result: data.result,
      userId: ctx.user.id,
      projectId: scope.project.id,
      locationId: scope.location.id,
      stageKey: data.stageKey,
      driveId: scope.location.driveId,
      parentItemId: data.parentItemId,
      driveItemId: data.driveItemId,
      name: data.name,
      previousName: data.previousName ?? null,
      path: data.path,
      errorCode: data.error?.code ?? null,
      errorMessage: data.error?.message ?? null,
      environment: dataEnvironment(),
    },
  });
}

/**
 * Crea una subcarpeta en una ubicación autorizada.
 * Validaciones: permiso, proyecto, carpeta padre dentro del alcance, nombre válido,
 * profundidad máxima, duplicados (sin distinguir mayúsculas) y concurrencia (409 de SharePoint).
 */
export async function createFolder(ctx: AuthContext, input: { projectId: string; parentItemId: string; name: string; locationId?: string | null }) {
  await requirePermission(ctx, "folder:create", { type: "project", id: input.projectId });
  const check = validateItemName(input.name, "folder");
  if (!check.ok) throw Errors.validation(check.error);
  const name = check.value;

  const scope = requireLocated(await resolveProjectScope(ctx, input.projectId, { locationId: input.locationId }));
  const storage = storageFor(ctx);
  const chain = await folderChain(ctx, scope, storage, input.parentItemId);
  const parent = chain[chain.length - 1];
  const stage = stageForChain(scope, chain);
  const parentPath = storage.fullPath(parent);
  const targetPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;

  if (!canCreateHere(ctx, scope, chain)) {
    await audit({ actor: ctx.actor, action: "ACCESS_DENIED", category: "SECURITY", result: "DENIED", projectId: scope.project.id, projectCode: scope.project.code, folderPath: targetPath, details: { reason: "create_not_allowed_here" } });
    if (chain.length - 1 >= scope.settings.structure.maxFolderDepth) throw Errors.validation(`Se alcanzó la profundidad máxima de carpetas (${scope.settings.structure.maxFolderDepth} niveles).`);
    throw Errors.forbidden("No puede crear carpetas en esta ubicación.");
  }

  const siblings = await storage.listChildren(scope.location.driveId, parent.id);
  const dup = siblings.find((s) => sameName(s.name, name));
  if (dup) throw Errors.nameExists(dup.name);

  let created: DriveItem;
  try {
    created = await storage.createFolder(scope.location.driveId, parent.id, name);
    // Confirmación de la creación real en el almacenamiento.
    created = await storage.getItem(scope.location.driveId, created.id);
    if (!created.isFolder || created.parentId !== parent.id) throw new AppError("SHAREPOINT_ERROR", "No se pudo confirmar la creación de la carpeta.", 502);
  } catch (err) {
    const appErr = err instanceof AppError ? err : new AppError("INTERNAL_ERROR", "Error al crear la carpeta.", 500);
    await recordFolderOp(ctx, scope, { type: "CREATE", result: "FAILURE", parentItemId: parent.id, driveItemId: null, name, path: targetPath, stageKey: stage?.key ?? null, error: appErr });
    await audit({ actor: ctx.actor, action: "FOLDER_CREATE_FAILED", category: "FOLDERS", result: "FAILURE", projectId: scope.project.id, projectCode: scope.project.code, folderPath: targetPath, details: { code: appErr.code } });
    if (appErr.code === "NAME_ALREADY_EXISTS") throw Errors.nameExists(name);
    throw err;
  }

  const path = storage.fullPath(created);
  const op = await recordFolderOp(ctx, scope, { type: "CREATE", result: "SUCCESS", parentItemId: parent.id, driveItemId: created.id, name: created.name, path, stageKey: stage?.key ?? null });
  await audit({
    actor: ctx.actor,
    action: "FOLDER_CREATED",
    category: "FOLDERS",
    result: "SUCCESS",
    projectId: scope.project.id,
    projectCode: scope.project.code,
    targetType: "folder",
    targetId: created.id,
    folderPath: path,
    details: { stage: stage?.key ?? null, storage: storage.kind, operationId: op.id },
  });
  return {
    folder: { id: created.id, name: created.name, webUrl: created.webUrl, createdAt: created.createdAt },
    path,
    relativePath: [...chain.slice(1).map((c) => c.name), created.name].join(" / "),
    breadcrumbs: [...chain, created].map((c, i) => ({ id: c.id, name: i === 0 ? scope.project.name : c.name })),
    operationId: op.id,
    storage: storage.kind,
  };
}

async function adminTarget(ctx: AuthContext, input: { projectId: string; itemId: string; locationId?: string | null }, permission: "folder:rename" | "folder:delete") {
  await requirePermission(ctx, permission, { type: "folder", id: input.itemId });
  const scope = requireLocated(await resolveProjectScope(ctx, input.projectId, { locationId: input.locationId }));
  const storage = storageFor(ctx);
  const chain = await folderChain(ctx, scope, storage, input.itemId);
  if (isProtectedFolder(scope, chain)) throw Errors.protectedFolder();
  return { scope, storage, chain, item: chain[chain.length - 1], parent: chain[chain.length - 2] };
}

/** Renombra una carpeta adicional (solo administrador; nunca la estructura principal). */
export async function renameFolder(ctx: AuthContext, input: { projectId: string; itemId: string; newName: string; locationId?: string | null }) {
  const check = validateItemName(input.newName, "folder");
  if (!check.ok) throw Errors.validation(check.error);
  const { scope, storage, chain, item, parent } = await adminTarget(ctx, input, "folder:rename");
  if (sameName(item.name, check.value) && item.name === check.value) throw Errors.validation("El nuevo nombre es igual al actual.");
  const siblings = await storage.listChildren(scope.location.driveId, parent.id);
  const dup = siblings.find((s) => s.id !== item.id && sameName(s.name, check.value));
  if (dup) throw Errors.nameExists(dup.name);
  const renamed = await storage.renameItem(scope.location.driveId, item.id, check.value);
  const path = storage.fullPath(renamed);
  await recordFolderOp(ctx, scope, { type: "RENAME", result: "SUCCESS", parentItemId: parent.id, driveItemId: item.id, name: renamed.name, previousName: item.name, path, stageKey: stageForChain(scope, chain)?.key ?? null });
  await audit({ actor: ctx.actor, action: "FOLDER_RENAMED", category: "FOLDERS", result: "SUCCESS", projectId: scope.project.id, projectCode: scope.project.code, targetType: "folder", targetId: item.id, folderPath: path, details: { from: item.name, to: renamed.name } });
  return { id: renamed.id, name: renamed.name, path };
}

/**
 * Elimina una carpeta adicional (solo administrador). Requiere escribir el nombre
 * exacto como confirmación. En SharePoint la carpeta va a la papelera de reciclaje.
 */
export async function deleteFolder(ctx: AuthContext, input: { projectId: string; itemId: string; confirmName: string; locationId?: string | null }) {
  const { scope, storage, chain, item, parent } = await adminTarget(ctx, input, "folder:delete");
  if (input.confirmName !== item.name) throw Errors.validation("Para confirmar, escriba el nombre exacto de la carpeta.");
  const path = storage.fullPath(item);
  await storage.deleteItem(scope.location.driveId, item.id);
  await recordFolderOp(ctx, scope, { type: "DELETE", result: "SUCCESS", parentItemId: parent.id, driveItemId: item.id, name: item.name, path, stageKey: stageForChain(scope, chain)?.key ?? null });
  await audit({ actor: ctx.actor, action: "FOLDER_DELETED", category: "FOLDERS", result: "SUCCESS", projectId: scope.project.id, projectCode: scope.project.code, targetType: "folder", targetId: item.id, folderPath: path, details: { childCount: item.childCount, storage: storage.kind } });
  return { deleted: true, path };
}

export type { StorageProvider };
