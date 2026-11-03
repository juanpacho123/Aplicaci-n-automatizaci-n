import "server-only";
import { db } from "@/lib/db/prisma";
import { dataEnvironment } from "@/lib/config/env";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";

/** Indicadores del panel calculados exclusivamente a partir de datos persistidos. */
export async function adminDashboard(ctx: AuthContext) {
  await requirePermission(ctx, "admin:access");
  const environment = dataEnvironment();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [activeContractors, pendingRequests, pendingInvitations, projects, uploaded, uploadErrors, recent, recentFolders] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE", roleKey: "CONTRACTOR" } }),
    db.accessRequest.count({ where: { status: { in: ["PENDING", "INFO_REQUESTED"] } } }),
    db.user.count({ where: { status: { in: ["INVITATION_SENT", "PENDING_APPROVAL"] } } }),
    db.project.count({ where: { status: "ACTIVE" } }),
    db.uploadedFile.count({ where: { status: "SUCCESS", operation: { environment } } }),
    db.uploadedFile.count({ where: { status: "ERROR", createdAt: { gte: since }, operation: { environment } } }),
    db.uploadOperation.findMany({
      where: { environment },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { fullName: true, company: { select: { name: true } } } }, project: { select: { code: true, name: true } } },
    }),
    db.folderOperation.findMany({ where: { environment, type: "CREATE", result: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { fullName: true } }, project: { select: { code: true } } } }),
  ]);
  const projectsWithoutLocation = await db.project.count({ where: { status: "ACTIVE", locations: { none: {} } } });
  return { activeContractors, pendingRequests, pendingInvitations, projects, projectsWithoutLocation, uploaded, uploadErrors, recent, recentFolders };
}

/** Resumen personal para la pantalla de inicio del contratista. */
export async function contractorHome(ctx: AuthContext) {
  const environment = dataEnvironment();
  const [recent, totals] = await Promise.all([
    db.uploadOperation.findMany({ where: { userId: ctx.user.id, environment }, orderBy: { createdAt: "desc" }, take: 5, include: { project: { select: { code: true, name: true } } } }),
    db.uploadedFile.groupBy({ by: ["status"], where: { operation: { userId: ctx.user.id, environment } }, _count: { _all: true } }),
  ]);
  const count = (s: string) => totals.find((t) => t.status === s)?._count._all ?? 0;
  return { recent, uploaded: count("SUCCESS"), errors: count("ERROR") };
}
