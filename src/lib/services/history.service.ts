import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { dataEnvironment } from "@/lib/config/env";
import { Errors } from "@/lib/http/errors";
import { can } from "@/lib/authz/policy";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import type { Prisma } from "@/generated/prisma/client";
import { getSettings } from "./settings.service";
import { expireStaleUploads } from "./uploads.service";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const HistoryFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "SUCCESS", "ERROR", "CANCELLED"]).optional().or(z.literal("").transform(() => undefined)),
  projectId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  userId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  companyId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  from: dateStr,
  to: dateStr,
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;

/**
 * Historial de documentos (archivo por archivo). Persistido en PostgreSQL.
 * Contratistas: solo sus cargas. Administrador: todas, con filtros.
 */
export async function listDocumentHistory(ctx: AuthContext, filter: HistoryFilter) {
  const all = can(ctx.role, "history:read:all");
  if (!all) await requirePermission(ctx, "history:read:own");
  await expireStaleUploads();
  const settings = await getSettings();
  const opWhere: Prisma.UploadOperationWhereInput = {
    environment: dataEnvironment(),
    ...(all ? {} : { userId: ctx.user.id }),
    ...(all && filter.userId ? { userId: filter.userId } : {}),
    ...(all && filter.companyId ? { user: { companyId: filter.companyId } } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
  };
  const created: Prisma.DateTimeFilter = {};
  if (filter.from) created.gte = new Date(`${filter.from}T00:00:00`);
  if (filter.to) created.lt = new Date(new Date(`${filter.to}T00:00:00`).getTime() + 86_400_000);
  const where: Prisma.UploadedFileWhereInput = {
    operation: opWhere,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q ? { finalName: { contains: filter.q, mode: "insensitive" } } : {}),
    ...(filter.from || filter.to ? { createdAt: created } : {}),
  };
  const pageSize = 25;
  const [total, rows] = await Promise.all([
    db.uploadedFile.count({ where }),
    db.uploadedFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: { operation: { include: { project: { select: { id: true, code: true, name: true } }, user: { select: { id: true, fullName: true, email: true, company: { select: { name: true } } } } } } },
    }),
  ]);
  const stageLabel = new Map(settings.structure.stages.map((s) => [s.key, s.label]));
  return {
    total,
    page: filter.page,
    pageSize,
    rows: rows.map((f) => ({
      id: f.id,
      name: f.finalName,
      originalName: f.originalName,
      size: Number(f.size),
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      completedAt: f.completedAt?.toISOString() ?? null,
      errorMessage: f.errorMessage,
      webUrl: f.webUrl,
      contractor: f.operation.user.fullName,
      company: f.operation.user.company?.name ?? null,
      project: f.operation.project,
      stage: stageLabel.get(f.operation.stageKey) ?? f.operation.stageKey,
      folderPath: f.operation.folderPath,
      operationId: f.operationId,
      environment: f.operation.environment,
    })),
  };
}

export async function operationDetail(ctx: AuthContext, operationId: string) {
  if (!z.string().uuid().safeParse(operationId).success) throw Errors.notFound("La operación no existe.");
  const op = await db.uploadOperation.findUnique({
    where: { id: operationId },
    include: {
      files: { orderBy: { createdAt: "asc" } },
      project: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, fullName: true, email: true, company: { select: { name: true } } } },
    },
  });
  if (!op || op.environment !== dataEnvironment()) throw Errors.notFound("La operación no existe.");
  if (!can(ctx.role, "history:read:all") && op.userId !== ctx.user.id) throw Errors.forbidden("Esta operación pertenece a otro usuario.");
  const settings = await getSettings();
  return {
    id: op.id,
    status: op.status,
    createdAt: op.createdAt.toISOString(),
    completedAt: op.completedAt?.toISOString() ?? null,
    project: op.project,
    user: op.user,
    stage: settings.structure.stages.find((s) => s.key === op.stageKey)?.label ?? op.stageKey,
    folderPath: op.folderPath,
    environment: op.environment,
    totals: { total: op.totalFiles, success: op.successCount, error: op.errorCount, cancelled: op.cancelledCount },
    files: op.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      finalName: f.finalName,
      size: Number(f.size),
      status: f.status,
      conflictBehavior: f.conflictBehavior,
      attempts: f.attempts,
      driveItemId: f.driveItemId,
      webUrl: f.webUrl,
      verifiedAt: f.verifiedAt?.toISOString() ?? null,
      errorCode: f.errorCode,
      errorMessage: f.errorMessage,
    })),
  };
}

export const FolderOpsFilterSchema = z.object({
  projectId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  type: z.enum(["CREATE", "RENAME", "DELETE"]).optional().or(z.literal("").transform(() => undefined)),
  page: z.coerce.number().int().min(1).default(1),
});

export async function listFolderOperations(ctx: AuthContext, filter: z.infer<typeof FolderOpsFilterSchema>) {
  await requirePermission(ctx, "history:read:all");
  const where: Prisma.FolderOperationWhereInput = { environment: dataEnvironment(), ...(filter.projectId ? { projectId: filter.projectId } : {}), ...(filter.type ? { type: filter.type } : {}) };
  const pageSize = 25;
  const [total, rows] = await Promise.all([
    db.folderOperation.count({ where }),
    db.folderOperation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { fullName: true, company: { select: { name: true } } } }, project: { select: { code: true, name: true } } },
    }),
  ]);
  return { total, page: filter.page, pageSize, rows };
}
