import Link from "next/link";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status";
import { ProjectFormDialog } from "@/components/admin/projects";
import { requirePageAuth } from "@/lib/authz/guards";
import { listProjectsAdmin } from "@/lib/services/admin-projects.service";
import { getSettings } from "@/lib/services/settings.service";

export const metadata = { title: "Proyectos" };

export default async function AdminProjectsPage() {
  const ctx = await requirePageAuth("projects:manage");
  const [projects, settings] = await Promise.all([listProjectsAdmin(ctx), getSettings()]);
  const totalStages = settings.structure.stages.length;
  return (
    <>
      <PageHeader title="Proyectos" description="Registro de proyectos, su ubicación en SharePoint y los contratistas autorizados." actions={<ProjectFormDialog />} />
      <Panel>
        {projects.length === 0 ? (
          <EmptyState icon={<Briefcase />} title="Sin proyectos" description="Registre el primer proyecto y asocie su carpeta de SharePoint." />
        ) : (
          <TableContainer>
            <Table data-testid="admin-projects-table">
              <THead>
                <tr>
                  <TH>Código</TH>
                  <TH>Proyecto</TH>
                  <TH>Estado</TH>
                  <TH className="hidden md:table-cell">Ubicación SharePoint</TH>
                  <TH className="hidden lg:table-cell text-right">Contratistas</TH>
                  <TH className="hidden lg:table-cell text-right">Cargas</TH>
                </tr>
              </THead>
              <tbody>
                {projects.map((p) => {
                  const shared = p.locations.find((l) => !l.companyId) ?? p.locations[0];
                  return (
                    <TR key={p.id} data-testid="admin-project-row">
                      <TD className="whitespace-nowrap font-medium">{p.code}</TD>
                      <TD>
                        <Link href={`/admin/proyectos/${p.id}`} className="font-medium text-ink-900 hover:text-action-700 hover:underline">
                          {p.name}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge kind="project" value={p.status} />
                      </TD>
                      <TD className="hidden max-w-80 md:table-cell">
                        {shared ? (
                          <span className="flex items-center gap-2">
                            <span className="path-text truncate text-ink-600">{shared.rootPath}</span>
                            {shared.stageFolders.length < totalStages ? <Badge tone="warning">{shared.stageFolders.length}/{totalStages}</Badge> : null}
                            {p.locations.length > 1 ? <Badge tone="info">+{p.locations.length - 1}</Badge> : null}
                          </span>
                        ) : (
                          <Badge tone="warning">Sin ubicación</Badge>
                        )}
                      </TD>
                      <TD className="hidden text-right lg:table-cell" data-numeric>
                        {p._count.members}
                      </TD>
                      <TD className="hidden text-right lg:table-cell" data-numeric>
                        {p._count.uploadOperations}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </Panel>
    </>
  );
}
