import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelBody, PanelHeader, DescriptionList } from "@/components/ui/panel";
import { Alert } from "@/components/ui/alert";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { RoleBadge, StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { HistoryTable } from "@/components/shared/history-table";
import { EditUserDialog, ProjectAssignment, RoleSelector, UserStatusActions } from "@/components/admin/user-management";
import { requirePageAuth } from "@/lib/authz/guards";
import { isDemoMode } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";
import { isAppError } from "@/lib/http/errors";
import { getUserDetail, listCompanies } from "@/lib/services/users.service";
import { listDocumentHistory } from "@/lib/services/history.service";

export default async function ContractorDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requirePageAuth("users:manage");
  const { userId } = await params;
  let detail: Awaited<ReturnType<typeof getUserDetail>>;
  try {
    detail = await getUserDetail(ctx, userId);
  } catch (err) {
    return <Alert tone="danger">{isAppError(err) ? err.message : "Error inesperado."}</Alert>;
  }
  const { user, statusChangedBy } = detail;
  const [companies, projects, history] = await Promise.all([
    listCompanies(ctx),
    db.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true } }),
    listDocumentHistory(ctx, { userId, page: 1 }),
  ]);
  const demo = isDemoMode();
  const actionsUser = { id: user.id, status: user.status, roleKey: user.roleKey, identityType: user.identityType, fullName: user.fullName, phone: user.phone, companyId: user.companyId, isSelf: user.id === ctx.user.id };
  return (
    <>
      <Link href="/admin/contratistas" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-600 hover:text-ink-900">
        <ChevronLeft className="size-4" aria-hidden /> Contratistas
      </Link>
      <PageHeader eyebrow={user.company?.name ?? "Sin empresa"} title={user.fullName} description={user.email} actions={<UserStatusActions user={actionsUser} demo={demo} />} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Panel>
            <PanelHeader title="Registro y autorización" actions={<EditUserDialog user={actionsUser} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />} />
            <PanelBody>
              <DescriptionList
                items={[
                  { label: "Estado", value: <StatusBadge kind="user" value={user.status} /> },
                  { label: "Rol", value: <RoleBadge role={user.roleKey} /> },
                  { label: "Empresa", value: user.company?.name ?? "—" },
                  { label: "Teléfono", value: user.phone ?? "—" },
                  { label: "Tipo de identidad", value: user.identityType === "GUEST" ? "Invitado externo (B2B)" : user.identityType === "MEMBER" ? "Cuenta de la organización" : "Sin determinar" },
                  { label: "Identidad vinculada (oid)", value: user.entraObjectId ? <span className="path-text">{user.entraObjectId}</span> : "Pendiente" },
                  { label: "Fecha de registro", value: formatDateTime(user.createdAt) },
                  { label: "Autorizado por", value: user.authorizedBy ? `${user.authorizedBy.fullName} · ${formatDateTime(user.authorizedAt)}` : "—" },
                  { label: "Último cambio de estado", value: user.statusChangedAt ? `${formatDateTime(user.statusChangedAt)}${statusChangedBy ? ` por ${statusChangedBy.fullName}` : ""}` : "—" },
                  { label: "Motivo", value: user.statusReason ?? "—" },
                  { label: "Último inicio de sesión", value: formatDateTime(user.lastLoginAt) },
                  { label: "Sesiones activas", value: String(user.sessions.length) },
                ]}
              />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Historial de cargas" description={`${history.total} documentos`} actions={<Link href={`/admin/operaciones?userId=${user.id}`} className="text-[0.8125rem] font-medium text-action-600 hover:underline">Ver todo</Link>} />
            <HistoryTable {...history} rows={history.rows.slice(0, 10)} total={Math.min(history.total, 10)} showContractor={false} detailBase="/admin/operaciones" hrefFor={() => `/admin/operaciones?userId=${user.id}`} />
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Proyectos autorizados" description="El contratista solo verá estos proyectos." />
            <PanelBody>
              <ProjectAssignment userId={user.id} projects={projects} assigned={user.projects.map((p) => p.projectId)} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Rol" />
            <PanelBody>
              <RoleSelector userId={user.id} role={user.roleKey} disabled={user.id === ctx.user.id} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Invitaciones" />
            {user.invitations.length === 0 ? (
              <EmptyState title="Sin invitaciones" description={demo ? "Modo demostración: no se envían invitaciones." : "Se registran al autorizar a un invitado externo."} className="py-6" />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Fecha</TH>
                      <TH>Estado</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {user.invitations.map((i) => (
                      <TR key={i.id}>
                        <TD className="whitespace-nowrap">
                          {formatDateTime(i.createdAt)}
                          <span className="block text-[0.75rem] text-ink-500">{i.invitedBy.fullName}</span>
                          {i.errorMessage ? <span className="block text-[0.75rem] text-danger-700">{i.errorMessage}</span> : null}
                        </TD>
                        <TD>
                          <StatusBadge kind="invitation" value={i.status} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
