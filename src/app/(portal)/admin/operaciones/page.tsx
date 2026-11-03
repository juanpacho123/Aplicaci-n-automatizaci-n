import { PageHeader, LinkTabs, Pagination } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/shared/filter-bar";
import { HistoryTable, queryHref } from "@/components/shared/history-table";
import { FILE_STATUS_OPTIONS } from "@/components/shared/options";
import { StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { requirePageAuth } from "@/lib/authz/guards";
import { db } from "@/lib/db/prisma";
import { FolderOpsFilterSchema, HistoryFilterSchema, listDocumentHistory, listFolderOperations } from "@/lib/services/history.service";

export const metadata = { title: "Historial de operaciones" };

const TYPE_LABEL: Record<string, string> = { CREATE: "Creación", RENAME: "Renombrado", DELETE: "Eliminación" };

export default async function OperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageAuth("history:read:all");
  const sp = await searchParams;
  const tab = sp.tab === "carpetas" ? "carpetas" : "documentos";
  const [projects, users, companies] = await Promise.all([
    db.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.user.findMany({ where: { roleKey: { in: ["CONTRACTOR", "ADMIN"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const tabs = [
    { key: "documentos", label: "Documentos", href: "/admin/operaciones" },
    { key: "carpetas", label: "Carpetas", href: "/admin/operaciones?tab=carpetas" },
  ];

  if (tab === "carpetas") {
    const parsed = FolderOpsFilterSchema.safeParse(sp);
    const data = await listFolderOperations(ctx, parsed.success ? parsed.data : { page: 1 });
    return (
      <>
        <PageHeader title="Historial de operaciones" description="Operaciones de carpetas realizadas desde el portal." />
        <LinkTabs tabs={tabs} active="carpetas" />
        <Panel>
          <FilterBar
            resetHref="/admin/operaciones?tab=carpetas"
            hidden={{ tab: "carpetas" }}
            values={sp}
            fields={[
              { type: "select", name: "projectId", label: "Proyecto", options: projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) },
              { type: "select", name: "type", label: "Operación", options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) },
            ]}
          />
          {data.rows.length === 0 ? (
            <EmptyState title="Sin operaciones de carpetas" />
          ) : (
            <>
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Operación</TH>
                      <TH>Ruta</TH>
                      <TH>Usuario</TH>
                      <TH className="hidden md:table-cell">Proyecto</TH>
                      <TH>Fecha</TH>
                      <TH>Resultado</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {data.rows.map((r) => (
                      <TR key={r.id}>
                        <TD className="whitespace-nowrap">{TYPE_LABEL[r.type]}</TD>
                        <TD className="max-w-96">
                          <span className="path-text block truncate" title={r.path}>
                            {r.path}
                          </span>
                          {r.previousName ? <span className="block text-[0.75rem] text-ink-500">Antes: {r.previousName}</span> : null}
                          {r.errorMessage ? <span className="block text-[0.75rem] text-danger-700">{r.errorMessage}</span> : null}
                        </TD>
                        <TD className="whitespace-nowrap">
                          {r.user.fullName}
                          <span className="block text-[0.75rem] text-ink-500">{r.user.company?.name ?? ""}</span>
                        </TD>
                        <TD className="hidden whitespace-nowrap md:table-cell">{r.project.code}</TD>
                        <TD className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt)}</TD>
                        <TD>
                          <StatusBadge kind="audit" value={r.result === "SUCCESS" ? "SUCCESS" : "FAILURE"} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => queryHref("/admin/operaciones", { ...sp, tab: "carpetas" }, p)} />
            </>
          )}
        </Panel>
      </>
    );
  }

  const parsed = HistoryFilterSchema.safeParse(sp);
  const data = await listDocumentHistory(ctx, parsed.success ? parsed.data : { page: 1 });
  return (
    <>
      <PageHeader title="Historial de operaciones" description="Todas las cargas documentales registradas, con su resultado." />
      <LinkTabs tabs={tabs} active="documentos" />
      <Panel>
        <FilterBar
          resetHref="/admin/operaciones"
          values={sp}
          fields={[
            { type: "search", name: "q", placeholder: "Buscar documento" },
            { type: "select", name: "userId", label: "Contratista", options: users.map((u) => ({ value: u.id, label: u.fullName })) },
            { type: "select", name: "companyId", label: "Empresa", options: companies.map((c) => ({ value: c.id, label: c.name })) },
            { type: "select", name: "projectId", label: "Proyecto", options: projects.map((p) => ({ value: p.id, label: p.code })) },
            { type: "select", name: "status", label: "Estado", options: FILE_STATUS_OPTIONS },
            { type: "date", name: "from", label: "Desde" },
            { type: "date", name: "to", label: "Hasta" },
          ]}
        />
        <HistoryTable {...data} showContractor detailBase="/admin/operaciones" hrefFor={(p) => queryHref("/admin/operaciones", sp, p)} />
      </Panel>
    </>
  );
}
