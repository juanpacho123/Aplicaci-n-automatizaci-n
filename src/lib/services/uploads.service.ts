import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { dataEnvironment } from "@/lib/config/env";
import { AppError, Errors } from "@/lib/http/errors";
import { canReplace } from "@/lib/authz/policy";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import { storageFor } from "@/lib/storage";
import type { DriveItem } from "@/lib/storage/types";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { fileExtension, sameName, suggestAvailableName, validateFileCandidate, validateItemName } from "@/lib/validation/names";
import type { Settings } from "@/lib/validation/settings-schema";
import type { UploadFileStatus, UploadedFile, UploadOperation } from "@/generated/prisma/client";
import { chunkProblem, parseContentRangeHeader } from "@/lib/validation/content-range";
import { audit } from "./audit.service";
import { folderChain, requireLocated, resolveProjectScope, stageForChain, type LocatedScope } from "./project-scope.service";

const STALE_AFTER_MS = 6 * 3600_000;

export const PreflightSchema = z.object({
  projectId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  folderItemId: z.string().min(1).max(200),
  files: z.array(z.object({ name: z.string().max(400), size: z.number().int().nonnegative() })).min(1).max(500),
});

export const CreateOperationSchema = z.object({
  projectId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  folderItemId: z.string().min(1).max(200),
  files: z
    .array(
      z.object({
        clientKey: z.string().min(1).max(100),
        originalName: z.string().max(400),
        finalName: z.string().max(400),
        size: z.number().int().positive(),
        mimeType: z.string().max(200).nullable().optional(),
        conflictBehavior: z.enum(["FAIL", "REPLACE", "RENAME"]).default("FAIL"),
      }),
    )
    .min(1)
    .max(500),
});

function rules(settings: Settings) {
  return { maxFileSizeMB: settings.uploads.maxFileSizeMB, allowedExtensions: settings.uploads.allowedExtensions };
}

export function strategyFor(size: number, settings: Settings): "simple" | "session" {
  return size <= settings.uploads.simpleUploadMaxMB * 1024 * 1024 ? "simple" : "session";
}

export function chunkBytes(settings: Settings) {
  return settings.uploads.chunkSizeKB * 1024;
}

async function destination(ctx: AuthContext, projectId: string, folderItemId: string, locationId?: string | null) {
  // Solo el administrador puede indicar una ubicación concreta (resolveProjectScope lo verifica).
  const scope = requireLocated(await resolveProjectScope(ctx, projectId, { locationId: locationId ?? null }));
  const storage = storageFor(ctx);
  const chain = await folderChain(ctx, scope, storage, folderItemId);
  const stage = stageForChain(scope, chain);
  if (!stage) throw Errors.validation("Seleccione una etapa (Inicio, Ejecución o Cierre) y una carpeta de destino.");
  const folder = chain[chain.length - 1];
  return { scope, storage, chain, stage, folder, folderPath: storage.fullPath(folder) };
}

/**
 * Verificación previa: valida cada archivo y detecta nombres ya existentes en el
 * destino, para que el usuario decida (cancelar, reemplazar si está autorizado, renombrar).
 */
export async function preflight(ctx: AuthContext, input: z.infer<typeof PreflightSchema>) {
  await requirePermission(ctx, "document:upload", { type: "project", id: input.projectId });
  const { scope, storage, folder, folderPath, stage } = await destination(ctx, input.projectId, input.folderItemId, input.locationId);
  const s = scope.settings;
  if (input.files.length > s.uploads.maxFilesPerOperation) {
    throw Errors.validation(`Puede cargar como máximo ${s.uploads.maxFilesPerOperation} archivos por operación.`);
  }
  const existing = await storage.listChildren(scope.location.driveId, folder.id);
  const names = existing.map((e) => e.name);
  const batchSeen: string[] = [];
  return {
    destination: { projectId: scope.project.id, projectName: scope.project.name, stage: stage.label, folderId: folder.id, folderPath },
    canReplace: canReplace(ctx.role, s.uploads.allowContractorReplace),
    files: input.files.map((f) => {
      const errors = validateFileCandidate(f, rules(s));
      const match = existing.find((e) => sameName(e.name, f.name));
      const dupInBatch = batchSeen.some((n) => sameName(n, f.name));
      batchSeen.push(f.name);
      if (dupInBatch) errors.push("El archivo está repetido en la selección.");
      return {
        name: f.name,
        valid: errors.length === 0,
        errors,
        conflict: match ? { existingId: match.id, isFolder: match.isFolder, size: match.size, modifiedAt: match.modifiedAt, modifiedBy: match.modifiedBy } : null,
        suggestedName: match ? suggestAvailableName(f.name, [...names, ...batchSeen]) : null,
      };
    }),
  };
}

/** Crea la operación de carga y sus archivos tras revalidar todo en el servidor. */
export async function createUploadOperation(ctx: AuthContext, input: z.infer<typeof CreateOperationSchema>) {
  await requirePermission(ctx, "document:upload", { type: "project", id: input.projectId });
  const { scope, storage, folder, folderPath, stage } = await destination(ctx, input.projectId, input.folderItemId, input.locationId);
  const s = scope.settings;
  if (input.files.length > s.uploads.maxFilesPerOperation) throw Errors.validation(`Puede cargar como máximo ${s.uploads.maxFilesPerOperation} archivos por operación.`);

  const allowReplace = canReplace(ctx.role, s.uploads.allowContractorReplace);
  const existing = await storage.listChildren(scope.location.driveId, folder.id);
  const problems: { clientKey: string; name: string; error: string; suggestedName?: string }[] = [];
  const finalNames: string[] = [];

  for (const f of input.files) {
    const errors = validateFileCandidate({ name: f.originalName, size: f.size }, rules(s));
    const finalCheck = validateItemName(f.finalName, "file");
    if (!finalCheck.ok) errors.push(finalCheck.error);
    else if (fileExtension(finalCheck.value) !== fileExtension(f.originalName)) errors.push("El nuevo nombre debe conservar la extensión original.");
    if (f.conflictBehavior === "REPLACE" && !allowReplace) errors.push("No está autorizado para reemplazar documentos existentes.");
    if (f.conflictBehavior !== "RENAME" && f.finalName !== f.originalName) errors.push("Cambio de nombre no declarado.");
    const target = finalCheck.ok ? finalCheck.value : f.finalName;
    if (finalNames.some((n) => sameName(n, target))) errors.push("Hay dos archivos con el mismo nombre final en la selección.");
    finalNames.push(target);
    const match = existing.find((e) => sameName(e.name, target));
    if (match && (match.isFolder || f.conflictBehavior !== "REPLACE")) {
      errors.push(match.isFolder ? "Existe una carpeta con ese nombre." : "Ya existe un archivo con este nombre en el destino.");
    }
    if (errors.length) problems.push({ clientKey: f.clientKey, name: target, error: errors[0], suggestedName: match ? suggestAvailableName(target, [...existing.map((e) => e.name), ...finalNames]) : undefined });
  }
  if (problems.length) throw new AppError("CONFLICT", "Algunos archivos requieren revisión antes de cargar.", 409, { problems });

  const env = dataEnvironment();
  const op = await db.uploadOperation.create({
    data: {
      userId: ctx.user.id,
      projectId: scope.project.id,
      locationId: scope.location.id,
      stageKey: stage.key,
      driveId: scope.location.driveId,
      folderItemId: folder.id,
      folderPath,
      status: "PENDING",
      totalFiles: input.files.length,
      environment: env,
      ipAddress: ctx.request.ip,
      files: {
        create: input.files.map((f, i) => ({
          originalName: f.originalName,
          finalName: finalNames[i],
          extension: fileExtension(f.originalName),
          mimeType: f.mimeType ?? null,
          size: BigInt(f.size),
          conflictBehavior: f.conflictBehavior,
        })),
      },
    },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });
  await audit({
    actor: ctx.actor,
    action: "UPLOAD_STARTED",
    category: "DOCUMENTS",
    result: "SUCCESS",
    projectId: scope.project.id,
    projectCode: scope.project.code,
    targetType: "upload_operation",
    targetId: op.id,
    folderPath,
    details: { files: input.files.length, stage: stage.key, storage: storage.kind },
  });
  const byOrder = op.files;
  return {
    operationId: op.id,
    storage: storage.kind,
    destination: { projectName: scope.project.name, stage: stage.label, folderPath },
    chunkSize: chunkBytes(s),
    maxRetries: s.uploads.maxRetries,
    parallelUploads: s.uploads.parallelUploads,
    files: input.files.map((f, i) => ({
      clientKey: f.clientKey,
      fileId: byOrder[i].id,
      finalName: byOrder[i].finalName,
      size: f.size,
      strategy: strategyFor(f.size, s),
    })),
  };
}

type FileWithOp = UploadedFile & { operation: UploadOperation };

async function loadOwnedFile(ctx: AuthContext, fileId: string): Promise<FileWithOp> {
  if (!z.string().uuid().safeParse(fileId).success) throw Errors.notFound("El archivo no existe.");
  const file = await db.uploadedFile.findUnique({ where: { id: fileId }, include: { operation: true } });
  if (!file) throw Errors.notFound("El archivo no existe.");
  if (file.operation.userId !== ctx.user.id) {
    await audit({ actor: ctx.actor, action: "ACCESS_DENIED", category: "SECURITY", result: "DENIED", targetType: "uploaded_file", targetId: fileId, details: { reason: "not_owner" } });
    throw Errors.forbidden("Esta carga pertenece a otro usuario.");
  }
  if (file.operation.environment !== dataEnvironment()) throw Errors.notFound("El archivo no existe.");
  return file;
}

/** Recalcula el estado de la operación a partir de sus archivos (idempotente). */
export async function refreshOperationStatus(operationId: string) {
  const files = await db.uploadedFile.findMany({ where: { operationId }, select: { status: true } });
  const count = (s: UploadFileStatus) => files.filter((f) => f.status === s).length;
  const success = count("SUCCESS");
  const error = count("ERROR");
  const cancelled = count("CANCELLED");
  const active = count("PENDING") + count("IN_PROGRESS");
  const status =
    active > 0
      ? success + error + cancelled > 0 || count("IN_PROGRESS") > 0
        ? "IN_PROGRESS"
        : "PENDING"
      : success === files.length
        ? "COMPLETED"
        : success > 0
          ? "PARTIAL"
          : error > 0
            ? "FAILED"
            : "CANCELLED";
  await db.uploadOperation.update({
    where: { id: operationId },
    data: { status, successCount: success, errorCount: error, cancelledCount: cancelled, completedAt: active === 0 ? new Date() : null },
  });
  return status;
}

async function failFile(ctx: AuthContext, file: FileWithOp, err: AppError) {
  await db.uploadedFile.update({
    where: { id: file.id },
    data: { status: "ERROR", errorCode: err.code, errorMessage: err.message, lastActivityAt: new Date(), uploadSessionEnc: null },
  });
  await refreshOperationStatus(file.operationId);
  await audit({
    actor: ctx.actor,
    action: "DOCUMENT_UPLOAD_FAILED",
    category: "DOCUMENTS",
    result: "FAILURE",
    projectId: file.operation.projectId,
    targetType: "uploaded_file",
    targetId: file.id,
    documentName: file.finalName,
    folderPath: file.operation.folderPath,
    details: { code: err.code, message: err.message },
  });
}

/** Revalida destino y permisos antes de escribir (el usuario pudo ser suspendido o reasignado). */
async function revalidate(ctx: AuthContext, file: FileWithOp): Promise<{ scope: LocatedScope; storage: ReturnType<typeof storageFor> }> {
  await requirePermission(ctx, "document:upload", { type: "project", id: file.operation.projectId });
  const { scope, storage, folder } = await destination(ctx, file.operation.projectId, file.operation.folderItemId, ctx.role === "ADMIN" ? file.operation.locationId : null);
  if (scope.location.id !== file.operation.locationId || folder.id !== file.operation.folderItemId) throw Errors.forbidden("El destino de la carga ya no está autorizado.");
  if (file.conflictBehavior === "REPLACE" && !canReplace(ctx.role, scope.settings.uploads.allowContractorReplace)) throw Errors.forbidden("No está autorizado para reemplazar documentos.");
  return { scope, storage };
}

/** Inicia (o reinicia tras un error) la carga de un archivo. */
export async function startFile(ctx: AuthContext, fileId: string) {
  const file = await loadOwnedFile(ctx, fileId);
  if (file.status === "SUCCESS" || file.status === "CANCELLED") throw Errors.conflict("El archivo ya no admite nuevos intentos.");
  const { scope, storage } = await revalidate(ctx, file);
  const strategy = strategyFor(Number(file.size), scope.settings);
  if (file.attempts > scope.settings.uploads.maxRetries + 1) throw Errors.conflict("Se alcanzó el número máximo de reintentos para este archivo.");

  if (file.uploadSessionEnc) await storage.cancelUploadSession(decrypt(file.uploadSessionEnc, `upload:${file.id}`)).catch(() => undefined);

  let sessionEnc: string | null = null;
  let expiry: Date | null = null;
  if (strategy === "session") {
    try {
      const session = await storage.createUploadSession(file.operation.driveId, file.operation.folderItemId, file.finalName, Number(file.size), file.conflictBehavior === "REPLACE");
      sessionEnc = encrypt(session.uploadUrl, `upload:${file.id}`);
      expiry = session.expiresAt ? new Date(session.expiresAt) : null;
    } catch (err) {
      if (err instanceof AppError) await failFile(ctx, file, err);
      throw err;
    }
  }
  await db.uploadedFile.update({
    where: { id: file.id },
    data: {
      status: "IN_PROGRESS",
      attempts: { increment: 1 },
      bytesUploaded: BigInt(0),
      uploadSessionEnc: sessionEnc,
      uploadSessionExpiry: expiry,
      errorCode: null,
      errorMessage: null,
      startedAt: file.startedAt ?? new Date(),
      lastActivityAt: new Date(),
    },
  });
  await refreshOperationStatus(file.operationId);
  return { fileId: file.id, strategy, chunkSize: chunkBytes(scope.settings), nextExpectedRanges: ["0-"] };
}

export function parseContentRange(header: string | null): { start: number; end: number; total: number } {
  const r = parseContentRangeHeader(header);
  if (!r) throw Errors.validation("Encabezado Content-Range no válido.");
  return r;
}

/**
 * Recibe un fragmento del navegador y lo retransmite a SharePoint. El navegador
 * nunca recibe la URL de la sesión de carga ni tokens de Microsoft Graph.
 */
export async function uploadChunk(ctx: AuthContext, fileId: string, contentRange: string | null, body: Uint8Array) {
  const file = await loadOwnedFile(ctx, fileId);
  if (file.status !== "IN_PROGRESS") throw Errors.conflict("La carga de este archivo no está en curso.");
  const { start, end, total } = parseContentRange(contentRange);
  const size = Number(file.size);
  if (total !== size) throw Errors.validation("El tamaño declarado no coincide con el registrado para el archivo.");
  if (body.byteLength !== end - start + 1) throw Errors.validation("El tamaño del fragmento no coincide con el rango indicado.");

  const { scope, storage } = await revalidate(ctx, file);
  const strategy = strategyFor(size, scope.settings);
  const chunkSize = chunkBytes(scope.settings);

  try {
    let item: DriveItem | null = null;
    if (strategy === "simple") {
      if (start !== 0 || end !== size - 1) throw Errors.validation("Los archivos pequeños se envían en una sola solicitud.");
      item = await storage.uploadSmall(file.operation.driveId, file.operation.folderItemId, file.finalName, body, file.conflictBehavior === "REPLACE");
    } else {
      if (!file.uploadSessionEnc) throw new AppError("UPLOAD_SESSION_EXPIRED", "La sesión de carga no existe. Reinicie la carga del archivo.", 410);
      const problem = chunkProblem(body.byteLength, end, size, chunkSize);
      if (problem) throw Errors.validation(problem);
      if (start !== Number(file.bytesUploaded)) {
        return { done: false as const, bytesUploaded: Number(file.bytesUploaded), nextExpectedRanges: [`${Number(file.bytesUploaded)}-`] };
      }
      const result = await storage.uploadChunk(decrypt(file.uploadSessionEnc, `upload:${file.id}`), start, end, total, body);
      if (!result.done) {
        const next = Number((result.nextExpectedRanges[0] ?? `${end + 1}-`).split("-")[0]);
        await db.uploadedFile.update({ where: { id: file.id }, data: { bytesUploaded: BigInt(Math.min(next, size)), lastActivityAt: new Date() } });
        return { done: false as const, bytesUploaded: next, nextExpectedRanges: result.nextExpectedRanges };
      }
      item = result.item;
    }
    return { done: true as const, ...(await finalize(ctx, file, item, scope)) };
  } catch (err) {
    if (err instanceof AppError && err.code !== "VALIDATION_ERROR" && err.code !== "SHAREPOINT_THROTTLED") await failFile(ctx, file, err);
    throw err;
  }
}

/** Confirma que el archivo existe realmente en el destino antes de marcarlo como cargado. */
async function finalize(ctx: AuthContext, file: FileWithOp, item: DriveItem, scope: LocatedScope) {
  const storage = storageFor(ctx);
  const verified = await storage.getItem(file.operation.driveId, item.id);
  if (verified.isFolder || verified.parentId !== file.operation.folderItemId || verified.size !== Number(file.size)) {
    throw new AppError("SHAREPOINT_ERROR", "No se pudo verificar el archivo en el destino.", 502);
  }
  const now = new Date();
  await db.uploadedFile.update({
    where: { id: file.id },
    data: {
      status: "SUCCESS",
      bytesUploaded: file.size,
      driveItemId: verified.id,
      webUrl: verified.webUrl,
      eTag: verified.eTag,
      finalName: verified.name,
      verifiedAt: now,
      completedAt: now,
      lastActivityAt: now,
      uploadSessionEnc: null,
      errorCode: null,
      errorMessage: null,
    },
  });
  const opStatus = await refreshOperationStatus(file.operationId);
  const path = storage.fullPath(verified);
  await audit({
    actor: ctx.actor,
    action: "DOCUMENT_UPLOADED",
    category: "DOCUMENTS",
    result: "SUCCESS",
    projectId: scope.project.id,
    projectCode: scope.project.code,
    targetType: "drive_item",
    targetId: verified.id,
    documentName: verified.name,
    folderPath: file.operation.folderPath,
    details: { size: Number(file.size), replace: file.conflictBehavior === "REPLACE", storage: storage.kind, operationId: file.operationId },
  });
  return { item: { id: verified.id, name: verified.name, webUrl: verified.webUrl, size: verified.size, path }, verifiedAt: now.toISOString(), operationStatus: opStatus, storage: storage.kind };
}

/** Estado de un archivo; para sesiones activas consulta los rangos pendientes (reanudación). */
export async function fileStatus(ctx: AuthContext, fileId: string) {
  const file = await loadOwnedFile(ctx, fileId);
  let nextExpectedRanges: string[] | null = null;
  if (file.status === "IN_PROGRESS" && file.uploadSessionEnc) {
    try {
      const st = await storageFor(ctx).uploadSessionStatus(decrypt(file.uploadSessionEnc, `upload:${file.id}`));
      nextExpectedRanges = st.nextExpectedRanges;
      const next = Number((st.nextExpectedRanges[0] ?? "0-").split("-")[0]);
      if (next !== Number(file.bytesUploaded)) await db.uploadedFile.update({ where: { id: file.id }, data: { bytesUploaded: BigInt(next) } });
    } catch (err) {
      if (err instanceof AppError && (err.code === "UPLOAD_SESSION_EXPIRED" || err.code === "SHAREPOINT_NOT_FOUND")) {
        await failFile(ctx, file, new AppError("UPLOAD_SESSION_EXPIRED", "La sesión de carga expiró. Reinicie la carga del archivo.", 410));
      } else throw err;
    }
  }
  const fresh = await db.uploadedFile.findUniqueOrThrow({ where: { id: file.id } });
  return {
    fileId: fresh.id,
    status: fresh.status,
    bytesUploaded: Number(fresh.bytesUploaded),
    size: Number(fresh.size),
    nextExpectedRanges,
    errorCode: fresh.errorCode,
    errorMessage: fresh.errorMessage,
    driveItemId: fresh.driveItemId,
    webUrl: fresh.webUrl,
  };
}

export async function cancelFile(ctx: AuthContext, fileId: string) {
  const file = await loadOwnedFile(ctx, fileId);
  if (file.status === "SUCCESS") throw Errors.conflict("El archivo ya fue cargado; no se puede cancelar.");
  if (file.status === "CANCELLED") return { status: "CANCELLED" as const };
  if (file.uploadSessionEnc) await storageFor(ctx).cancelUploadSession(decrypt(file.uploadSessionEnc, `upload:${file.id}`)).catch(() => undefined);
  await db.uploadedFile.update({ where: { id: file.id }, data: { status: "CANCELLED", uploadSessionEnc: null, lastActivityAt: new Date(), completedAt: new Date() } });
  await refreshOperationStatus(file.operationId);
  await audit({
    actor: ctx.actor,
    action: "DOCUMENT_UPLOAD_CANCELLED",
    category: "DOCUMENTS",
    result: "SUCCESS",
    projectId: file.operation.projectId,
    targetType: "uploaded_file",
    targetId: file.id,
    documentName: file.finalName,
    folderPath: file.operation.folderPath,
  });
  return { status: "CANCELLED" as const };
}

/** Marca como interrumpidas las cargas sin actividad (p. ej. se cerró el navegador). */
export async function expireStaleUploads(now = Date.now()) {
  const stale = await db.uploadedFile.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] }, OR: [{ lastActivityAt: { lt: new Date(now - STALE_AFTER_MS) } }, { lastActivityAt: null, createdAt: { lt: new Date(now - STALE_AFTER_MS) } }] },
    select: { id: true, operationId: true },
    take: 500,
  });
  if (stale.length === 0) return 0;
  await db.uploadedFile.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: "ERROR", errorCode: "INTERRUPTED", errorMessage: "La carga se interrumpió antes de completarse.", uploadSessionEnc: null },
  });
  for (const opId of new Set(stale.map((s) => s.operationId))) await refreshOperationStatus(opId);
  return stale.length;
}
