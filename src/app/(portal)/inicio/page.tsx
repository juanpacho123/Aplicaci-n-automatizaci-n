import Link from "next/link";
import { ArrowRight, Folders, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { requirePageAuth } from "@/lib/authz/guards";
import { can } from "@/lib/authz/policy";
import { listAccessibleProjects } from "@/lib/services/projects.service";
import { contractorHome } from "@/lib/services/dashboard.service";

export const metadata = { title: "Inicio" };

export default async function HomePage() {
  const ctx = await requirePageAuth("project:read");
  const [projects, home] = await Promise.all([listAccessibleProjects(ctx), contractorHome(ctx)]);
  const canUpload = can(ctx.role, "document:upload");
  return (
    <>
      <PageHeader
        eyebrow={ctx.user.company?.name ?? undefined}
        title={`Bienvenido, ${ctx.user.fullName.split(" ")[0]}`}
        description={canUpload ? "Cargue documentación en las carpetas de sus proyectos y consulte el estado de sus cargas." : "Consulte la documentación de los proyectos autorizados."}
        actions={
          canUpload ? (
            <Button asChild variant="primary">
              <Link href="/cargar">
                <Upload aria-hidden /> Cargar documentos
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelHeader title="Mis proyectos" description={`${projects.length} ${projects.length === 1 ? "proyecto autorizado" : "proyectos autorizados"}`} actions={<Link href="/proyectos" className="text-[0.8125rem] font-medium text-action-600 hover:underline">Ver todos</Link>} />
          {projects.length === 0 ? (
            <EmptyState icon={<Folders />} title="Sin proyectos asignados" description="Cuando el administrador le asigne proyectos aparecerán aquí." />
          ) : (
            <ul className="divide-y divide-line" data-testid="home-projects">
              {projects.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/proyectos/${p.id}`} className="block truncate text-[0.8125rem] font-medium text-ink-900 hover:text-action-700">
                      {p.name}
                    </Link>
                    <p className="text-[0.75rem] text-ink-500">
                      {p.code} · {p.lastUploadAt ? `Última carga ${formatDateTime(p.lastUploadAt)}` : "Sin cargas registradas"}
                    </p>
                  </div>
                  {canUpload && p.hasLocation ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/cargar?proyecto=${p.id}`}>Cargar</Link>
                    </Button>
                  ) : null}
                  <Link href={`/proyectos/${p.id}`} aria-label={`Abrir ${p.name}`} className="text-ink-400 hover:text-ink-700">
                    <ArrowRight className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {canUpload ? (
          <Panel className="xl:col-span-2">
            <PanelHeader title="Cargas recientes" description={`${home.uploaded} documentos cargados${home.errors ? ` · ${home.errors} con error` : ""}`} actions={<Link href="/historial" className="text-[0.8125rem] font-medium text-action-600 hover:underline">Historial</Link>} />
            {home.recent.length === 0 ? (
              <EmptyState title="Aún no hay cargas" description="Las operaciones de carga aparecerán aquí." />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Proyecto</TH>
                      <TH>Fecha</TH>
                      <TH>Estado</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {home.recent.map((r) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/historial/${r.id}`} className="font-medium hover:underline">
                            {r.project.code}
                          </Link>
                          <span className="block text-[0.75rem] text-ink-500" data-numeric>
                            {r.successCount}/{r.totalFiles} archivos
                          </span>
                        </TD>
                        <TD className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt)}</TD>
                        <TD>
                          <StatusBadge kind="operation" value={r.status} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Panel>
        ) : null}
      </div>
    </>
  );
}
