import { ShieldCheck } from "lucide-react";
import { PageHeader, Pagination } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/shared/filter-bar";
import { queryHref } from "@/components/shared/history-table";
import { AUDIT_CATEGORY_OPTIONS } from "@/components/shared/options";
import { StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { requirePageAuth } from "@/lib/authz/guards";
import { AuditFilterSchema, listAuditLogs } from "@/lib/services/audit-query.service";

export const metadata = { title: "Auditoría" };

const ACTION_LABEL: Record<string, string> = {
  AUTH_LOGIN: "Inicio de sesión",
  AUTH_LOGIN_DENIED: "Inicio de sesión rechazado",
  AUTH_LOGOUT: "Cierre de sesión",
  AUTH_IDENTITY_BOUND: "Identidad vinculada",
  AUTH_IDENTITY_MISMATCH: "Identidad no coincidente",
  USER_CREATED: "Usuario registrado",
  USER_UPDATED: "Usuario modificado",
  USER_AUTHORIZED: "Usuario autorizado",
  USER_SUSPENDED: "Usuario suspendido",
  USER_REACTIVATED: "Usuario reactivado",
  USER_REJECTED: "Usuario rechazado",
  USER_ROLE_CHANGED: "Cambio de rol",
  USER_PROJECTS_CHANGED: "Cambio de proyectos asignados",
  INVITATION_SENT: "Invitación B2B enviada",
  INVITATION_FAILED: "Invitación B2B fallida",
  COMPANY_CREATED: "Empresa registrada",
  COMPANY_UPDATED: "Empresa modificada",
  ACCESS_REQUEST_CREATED: "Solicitud de acceso recibida",
  ACCESS_REQUEST_APPROVED: "Solicitud aprobada",
  ACCESS_REQUEST_REJECTED: "Solicitud rechazada",
  ACCESS_REQUEST_INFO_REQUESTED: "Información adicional",
  PROJECT_CREATED: "Proyecto registrado",
  PROJECT_UPDATED: "Proyecto modificado",
  PROJECT_LOCATION_SET: "Ubicación asociada",
  PROJECT_LOCATION_REMOVED: "Ubicación desasociada",
  PROJECT_STRUCTURE_VERIFIED: "Estructura verificada",
  PROJECT_STAGE_FOLDER_CREATED: "Carpeta de estructura creada",
  FOLDER_CREATED: "Carpeta creada",
  FOLDER_CREATE_FAILED: "Error al crear carpeta",
  FOLDER_RENAMED: "Carpeta renombrada",
  FOLDER_DELETED: "Carpeta eliminada",
  FOLDER_OPERATION_FAILED: "Operación de carpeta fallida",
  UPLOAD_STARTED: "Carga iniciada",
  DOCUMENT_UPLOADED: "Documento cargado",
  DOCUMENT_UPLOAD_FAILED: "Error de carga",
  DOCUMENT_UPLOAD_CANCELLED: "Carga cancelada",
  SETTINGS_UPDATED: "Configuración modificada",
  ACCESS_DENIED: "Acceso denegado",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageAuth("audit:read");
  const sp = await searchParams;
  const parsed = AuditFilterSchema.safeParse(sp);
  const data = await listAuditLogs(ctx, parsed.success ? parsed.data : { page: 1 });
  return (
    <>
      <PageHeader title="Auditoría" description="Registro inmutable de accesos, operaciones documentales y cambios administrativos. No se almacenan contraseñas, tokens ni secretos." />
      <Panel>
        <FilterBar
          resetHref="/admin/auditoria"
          values={sp}
          fields={[
            { type: "search", name: "q", placeholder: "Usuario, documento, ruta o proyecto" },
            { type: "select", name: "category", label: "Categoría", options: AUDIT_CATEGORY_OPTIONS },
            {
              type: "select",
              name: "result",
              label: "Resultado",
              options: [
                { value: "SUCCESS", label: "Correcto" },
                { value: "FAILURE", label: "Error" },
                { value: "DENIED", label: "Denegado" },
              ],
            },
            { type: "date", name: "from", label: "Desde" },
            { type: "date", name: "to", label: "Hasta" },
          ]}
        />
        {data.rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="Sin eventos" description="No hay eventos que coincidan con los filtros." />
        ) : (
          <>
            <TableContainer>
              <Table data-testid="audit-table">
                <THead>
                  <tr>
                    <TH>Fecha y hora</TH>
                    <TH>Evento</TH>
                    <TH>Usuario</TH>
                    <TH className="hidden lg:table-cell">Objeto</TH>
                    <TH className="hidden xl:table-cell">Origen</TH>
                    <TH>Resultado</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.rows.map((r) => (
                    <TR key={r.id} data-testid="audit-row">
                      <TD className="whitespace-nowrap text-ink-600">{formatDateTime(r.occurredAt)}</TD>
                      <TD>
                        <span className="font-medium text-ink-900">{ACTION_LABEL[r.action] ?? r.action}</span>
                        <span className="block font-mono text-2xs text-ink-400">{r.action}</span>
                      </TD>
                      <TD>
                        {r.actorName ?? r.actorEmail ?? <span className="text-ink-400">Anónimo</span>}
                        {r.actorCompany ? <span className="block text-[0.75rem] text-ink-500">{r.actorCompany}</span> : r.actorEmail && r.actorName ? <span className="block text-[0.75rem] text-ink-500">{r.actorEmail}</span> : null}
                      </TD>
                      <TD className="hidden max-w-96 lg:table-cell">
                        {r.projectCode ? <span className="mr-1.5 font-medium">{r.projectCode}</span> : null}
                        {r.documentName ? <span className="block truncate">{r.documentName}</span> : null}
                        {r.folderPath ? <span className="path-text block truncate text-ink-600" title={r.folderPath}>{r.folderPath}</span> : null}
                        {r.details && typeof r.details === "object" ? (
                          <details className="mt-0.5">
                            <summary className="cursor-pointer text-[0.75rem] text-action-600">Detalles</summary>
                            <pre className="mt-1 max-h-48 overflow-auto rounded-sm bg-subtle p-2 font-mono text-2xs text-ink-700">{JSON.stringify(r.details, null, 2)}</pre>
                          </details>
                        ) : null}
                      </TD>
                      <TD className="hidden whitespace-nowrap font-mono text-2xs text-ink-500 xl:table-cell">{r.ipAddress ?? "—"}</TD>
                      <TD>
                        <StatusBadge kind="audit" value={r.result} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => queryHref("/admin/auditoria", sp, p)} />
          </>
        )}
      </Panel>
    </>
  );
}
