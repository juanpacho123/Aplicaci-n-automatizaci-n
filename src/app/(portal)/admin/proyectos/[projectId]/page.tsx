import Link from "next/link";
import { ChevronLeft, ExternalLink, FolderTree } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { RoleBadge, StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { LocationPicker, ProjectFormDialog, RemoveLocationButton, StructurePanel } from "@/components/admin/projects";
import { requirePageAuth } from "@/lib/authz/guards";
import { db } from "@/lib/db/prisma";
import { isAppError } from "@/lib/http/errors";
import { projectAdminDetail } from "@/lib/services/admin-projects.service";

export default async function AdminProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const ctx = await requirePageAuth("projects:manage");
  const { projectId } = await params;
  let data: Awaited<ReturnType<typeof projectAdminDetail>>;
  try {
    data = await projectAdminDetail(ctx, projectId);
  } catch (err) {
    return <Alert tone="danger">{isAppError(err) ? err.message : "Error inesperado."}</Alert>;
  }
  const { project, uploads, folders } = data;
  const companies = await db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <Link href="/admin/proyectos" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-600 hover:text-ink-900">
        <ChevronLeft className="size-4" aria-hidden /> Proyectos
      </Link>
      <PageHeader
        eyebrow={project.code}
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <>
            <StatusBadge kind="project" value={project.status} />
            <ProjectFormDialog project={project} />
            {project.locations.length ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/admin/documental?proyecto=${project.id}`}>
                  <FolderTree aria-hidden /> Gestión documental
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Panel>
            <PanelHeader title="Ubicación en SharePoint" description="Carpeta que contiene las etapas Inicio, Ejecución y Cierre." actions={<LocationPicker projectId={project.id} companies={companies} hasShared={project.locations.some((l) => !l.companyId)} />} />
            {project.locations.length === 0 ? (
              <EmptyState icon={<FolderTree />} title="Sin ubicación asociada" description="Seleccione la carpeta existente del proyecto en la biblioteca. No se crearán estructuras paralelas." />
            ) : (
              <div className="divide-y divide-line">
                {project.locations.map((l) => (
                  <div key={l.id} className="space-y-3 px-4 py-4 sm:px-5" data-testid="location-block">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={l.companyId ? "info" : "brand"}>{l.company ? `Solo ${l.company.name}` : "Compartida"}</Badge>
                          {l.verifiedAt ? <span className="text-[0.75rem] text-ink-500">Verificada {formatDateTime(l.verifiedAt)}</span> : <Badge tone="warning">Sin verificar</Badge>}
                        </div>
                        <p className="path-text mt-1 text-ink-800">{l.rootPath}</p>
                        {l.webUrl ? (
                          <a href={l.webUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[0.75rem] text-action-600 hover:underline">
                            Abrir en SharePoint <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : null}
                      </div>
                      <RemoveLocationButton locationId={l.id} path={l.rootPath} />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[0.75rem]">
                      {l.stageFolders.map((sf) => (
                        <span key={sf.id} className="rounded-sm border border-line bg-subtle px-2 py-0.5 text-ink-700">
                          {sf.name}
                        </span>
                      ))}
                    </div>
                    <StructurePanel locationId={l.id} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Actividad reciente" />
            {uploads.length + folders.length === 0 ? <EmptyState title="Sin actividad registrada" className="py-6" /> : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Operación</TH>
                    <TH>Usuario</TH>
                    <TH>Fecha</TH>
                    <TH>Resultado</TH>
                  </tr>
                </THead>
                <tbody>
                  {[...uploads.map((u) => ({ id: u.id, kind: "upload" as const, at: u.createdAt, by: u.user.fullName, text: `Carga de ${u.totalFiles} archivo(s) en ${u.folderPath}`, status: u.status })), ...folders.map((f) => ({ id: f.id, kind: "folder" as const, at: f.createdAt, by: f.user.fullName, text: `${f.type === "CREATE" ? "Carpeta creada" : f.type === "RENAME" ? "Carpeta renombrada" : "Carpeta eliminada"}: ${f.path}`, status: f.result }))]
                    .sort((a, b) => b.at.getTime() - a.at.getTime())
                    .slice(0, 12)
                    .map((r) => (
                      <TR key={r.kind + r.id}>
                        <TD className="max-w-96">
                          {r.kind === "upload" ? (
                            <Link href={`/admin/operaciones/${r.id}`} className="block truncate hover:underline">
                              {r.text}
                            </Link>
                          ) : (
                            <span className="block truncate">{r.text}</span>
                          )}
                        </TD>
                        <TD className="whitespace-nowrap">{r.by}</TD>
                        <TD className="whitespace-nowrap text-ink-600">{formatDateTime(r.at)}</TD>
                        <TD>{r.kind === "upload" ? <StatusBadge kind="operation" value={r.status} /> : <StatusBadge kind="audit" value={r.status === "SUCCESS" ? "SUCCESS" : "FAILURE"} />}</TD>
                      </TR>
                    ))}
                </tbody>
              </Table>
            </TableContainer>
            )}
          </Panel>
        </div>
        <Panel>
          <PanelHeader title="Usuarios autorizados" description={`${project.members.length} con acceso`} />
          {project.members.length === 0 ? (
            <EmptyState title="Sin usuarios asignados" description="Asigne el proyecto desde la ficha de cada contratista." className="py-6" />
          ) : (
            <ul className="divide-y divide-line">
              {project.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/admin/contratistas/${m.userId}`} className="block truncate text-[0.8125rem] font-medium hover:underline">
                      {m.user.fullName}
                    </Link>
                    <span className="block truncate text-[0.75rem] text-ink-500">{m.user.company?.name ?? m.user.email}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <RoleBadge role={m.user.roleKey} />
                    {m.user.status !== "ACTIVE" ? <StatusBadge kind="user" value={m.user.status} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <PanelBody className="border-t border-line text-[0.75rem] text-ink-500">Recuerde que los permisos de SharePoint de cada contratista se otorgan desde la biblioteca; el portal valida ambos.</PanelBody>
        </Panel>
      </div>
    </>
  );
}
