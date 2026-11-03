import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status";
import { formatDateTime, formatNumber } from "@/components/shared/format";
import { requirePageAuth } from "@/lib/authz/guards";
import { isDemoMode, microsoftConfigStatus } from "@/lib/config/env";
import { adminDashboard } from "@/lib/services/dashboard.service";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Panel de control" };

function Metric({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "warning" | "danger" }) {
  return (
    <Link href={href} className="group rounded-lg border border-line bg-surface px-4 py-3.5 shadow-xs transition-colors hover:border-ink-300" data-testid={`metric-${label}`}>
      <p className="text-[0.75rem] font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold leading-8 text-ink-950", tone === "warning" && value > 0 && "text-warning-700", tone === "danger" && value > 0 && "text-danger-700")} data-numeric>
        {formatNumber(value)}
      </p>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const ctx = await requirePageAuth("admin:access");
  const d = await adminDashboard(ctx);
  const ms = microsoftConfigStatus();
  return (
    <>
      <PageHeader title="Panel de control" description="Indicadores calculados a partir de los registros del portal." />
      {!isDemoMode() && !ms.ready ? (
        <Alert tone="warning" title="Configuración de Microsoft 365 incompleta" className="mb-5" action={<Link href="/admin/configuracion" className="text-[0.8125rem] font-medium text-action-600 hover:underline">Revisar</Link>}>
          Faltan {ms.checks.filter((c) => !c.ok).length} parámetros para operar con SharePoint.
        </Alert>
      ) : null}
      {d.projectsWithoutLocation > 0 ? (
        <Alert tone="info" className="mb-5" action={<Link href="/admin/proyectos" className="text-[0.8125rem] font-medium text-action-600 hover:underline">Ver proyectos</Link>}>
          {d.projectsWithoutLocation} {d.projectsWithoutLocation === 1 ? "proyecto activo no tiene" : "proyectos activos no tienen"} ubicación de SharePoint asociada.
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Contratistas activos" value={d.activeContractors} href="/admin/contratistas?status=ACTIVE&role=CONTRACTOR" />
        <Metric label="Solicitudes pendientes" value={d.pendingRequests} href="/admin/solicitudes" tone="warning" />
        <Metric label="Invitaciones sin completar" value={d.pendingInvitations} href="/admin/contratistas?status=INVITATION_SENT" tone="warning" />
        <Metric label="Proyectos activos" value={d.projects} href="/admin/proyectos" />
        <Metric label="Documentos cargados" value={d.uploaded} href="/admin/operaciones?status=SUCCESS" />
        <Metric label="Errores de carga (30 días)" value={d.uploadErrors} href="/admin/operaciones?status=ERROR" tone="danger" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Actividad reciente de carga" actions={<Link href="/admin/operaciones" className="text-[0.8125rem] font-medium text-action-600 hover:underline">Historial completo</Link>} />
          {d.recent.length === 0 ? (
            <EmptyState title="Sin actividad" description="Las operaciones de carga aparecerán aquí." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Contratista</TH>
                    <TH>Proyecto</TH>
                    <TH className="hidden md:table-cell">Destino</TH>
                    <TH>Fecha</TH>
                    <TH>Resultado</TH>
                  </tr>
                </THead>
                <tbody>
                  {d.recent.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`/admin/operaciones/${r.id}`} className="font-medium hover:underline">
                          {r.user.fullName}
                        </Link>
                        <span className="block text-[0.75rem] text-ink-500">{r.user.company?.name ?? "—"}</span>
                      </TD>
                      <TD className="whitespace-nowrap">{r.project.code}</TD>
                      <TD className="hidden max-w-64 md:table-cell">
                        <span className="path-text block truncate text-ink-600">{r.folderPath}</span>
                      </TD>
                      <TD className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt)}</TD>
                      <TD>
                        <StatusBadge kind="operation" value={r.status} />
                        <span className="ml-1.5 text-[0.75rem] text-ink-500" data-numeric>
                          {r.successCount}/{r.totalFiles}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Carpetas creadas recientemente" />
          {d.recentFolders.length === 0 ? (
            <EmptyState title="Sin carpetas nuevas" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentFolders.map((f) => (
                <li key={f.id} className="px-4 py-2.5 text-[0.8125rem]">
                  <span className="path-text block truncate text-ink-800" title={f.path}>
                    {f.path}
                  </span>
                  <span className="text-[0.75rem] text-ink-500">
                    {f.user.fullName} · {f.project.code} · {formatDateTime(f.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {d.uploadErrors > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-[0.75rem] text-ink-500">
          <AlertTriangle className="size-3.5" aria-hidden /> Revise los errores de carga en Historial de operaciones para identificar problemas de permisos o configuración.
        </p>
      ) : null}
    </>
  );
}
