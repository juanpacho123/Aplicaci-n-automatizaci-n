import Link from "next/link";
import { Folders } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/components/shared/format";
import { requirePageAuth } from "@/lib/authz/guards";
import { listAccessibleProjects } from "@/lib/services/projects.service";

export const metadata = { title: "Mis proyectos" };

export default async function ProjectsPage() {
  const ctx = await requirePageAuth("project:read");
  const projects = await listAccessibleProjects(ctx);
  return (
    <>
      <PageHeader title="Mis proyectos" description="Proyectos a los que tiene acceso autorizado." />
      <Panel>
        {projects.length === 0 ? (
          <EmptyState icon={<Folders />} title="Sin proyectos asignados" description="El administrador aún no le ha asignado proyectos." />
        ) : (
          <TableContainer>
            <Table data-testid="projects-table">
              <THead>
                <tr>
                  <TH>Código</TH>
                  <TH>Proyecto</TH>
                  <TH className="hidden md:table-cell">Estructura</TH>
                  <TH className="hidden sm:table-cell">Última carga</TH>
                </tr>
              </THead>
              <tbody>
                {projects.map((p) => (
                  <TR key={p.id} data-testid="project-row">
                    <TD className="whitespace-nowrap font-medium">{p.code}</TD>
                    <TD>
                      <Link href={`/proyectos/${p.id}`} className="font-medium text-ink-900 hover:text-action-700 hover:underline">
                        {p.name}
                      </Link>
                      {p.description ? <span className="block max-w-xl truncate text-[0.75rem] text-ink-500">{p.description}</span> : null}
                    </TD>
                    <TD className="hidden md:table-cell">
                      {!p.hasLocation ? <Badge tone="warning">Sin ubicación</Badge> : p.configuredStages < p.totalStages ? <Badge tone="warning">{p.configuredStages}/{p.totalStages} etapas</Badge> : <Badge tone="success">Configurada</Badge>}
                    </TD>
                    <TD className="hidden whitespace-nowrap text-ink-600 sm:table-cell">{formatDateTime(p.lastUploadAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </Panel>
    </>
  );
}
