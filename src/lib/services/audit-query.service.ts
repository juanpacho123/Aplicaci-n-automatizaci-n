import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import type { Prisma } from "@/generated/prisma/client";

const empty = z.literal("").transform(() => undefined);

export const AuditFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(["AUTH", "USERS", "COMPANIES", "ACCESS_REQUESTS", "PROJECTS", "FOLDERS", "DOCUMENTS", "SETTINGS", "SECURITY"]).optional().or(empty),
  result: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional().or(empty),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(empty),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(empty),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

/** Consulta de auditoría (solo lectura; el registro es inmutable a nivel de base de datos). */
export async function listAuditLogs(ctx: AuthContext, filter: z.infer<typeof AuditFilterSchema>) {
  await requirePermission(ctx, "audit:read");
  const occurred: Prisma.DateTimeFilter = {};
  if (filter.from) occurred.gte = new Date(`${filter.from}T00:00:00`);
  if (filter.to) occurred.lt = new Date(new Date(`${filter.to}T00:00:00`).getTime() + 86_400_000);
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.result ? { result: filter.result } : {}),
    ...(filter.from || filter.to ? { occurredAt: occurred } : {}),
    ...(filter.q
      ? {
          OR: [
            { actorEmail: { contains: filter.q, mode: "insensitive" } },
            { actorName: { contains: filter.q, mode: "insensitive" } },
            { action: { contains: filter.q.toUpperCase() } },
            { documentName: { contains: filter.q, mode: "insensitive" } },
            { folderPath: { contains: filter.q, mode: "insensitive" } },
            { projectCode: { contains: filter.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const pageSize = 50;
  const [total, rows] = await Promise.all([db.auditLog.count({ where }), db.auditLog.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (filter.page - 1) * pageSize, take: pageSize })]);
  return { total, page: filter.page, pageSize, rows: rows.map((r) => ({ ...r, id: r.id.toString() })) };
}
