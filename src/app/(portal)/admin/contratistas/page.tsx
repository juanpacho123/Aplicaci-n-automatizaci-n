import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader, LinkTabs, Pagination } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/shared/filter-bar";
import { queryHref } from "@/components/shared/history-table";
import { RoleBadge, StatusBadge } from "@/components/shared/status";
import { ROLE_OPTIONS, USER_STATUS_OPTIONS } from "@/components/shared/options";
import { formatDateTime } from "@/components/shared/format";
import { CreateUserDialog } from "@/components/admin/user-management";
import { requirePageAuth } from "@/lib/authz/guards";
import { isDemoMode } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";
import { listCompanies, listUsers, UserFilterSchema } from "@/lib/services/users.service";

export const metadata = { title: "Contratistas" };

export default async function ContractorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageAuth("users:manage");
  const sp = await searchParams;
  const clean = Object.fromEntries(Object.entries(sp).filter(([, v]) => v));
  const filter = UserFilterSchema.safeParse(clean);
  const [data, companies, projects] = await Promise.all([
    listUsers(ctx, filter.success ? filter.data : { page: 1 }),
    listCompanies(ctx),
    db.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true } }),
  ]);
  return (
    <>
      <PageHeader title="Contratistas" description="Registro, autorización, asignación de proyectos y control de acceso." actions={<CreateUserDialog projects={projects} companies={companies.map((c) => ({ id: c.id, name: c.name }))} demo={isDemoMode()} />} />
      <LinkTabs
        active="usuarios"
        tabs={[
          { key: "usuarios", label: "Usuarios", href: "/admin/contratistas", count: data.total },
          { key: "empresas", label: "Empresas", href: "/admin/contratistas/empresas", count: companies.length },
        ]}
      />
      <Panel>
        <FilterBar
          resetHref="/admin/contratistas"
          values={sp}
          fields={[
            { type: "search", name: "q", placeholder: "Buscar por nombre, correo o empresa" },
            { type: "select", name: "status", label: "Estado", options: USER_STATUS_OPTIONS },
            { type: "select", name: "role", label: "Rol", options: ROLE_OPTIONS },
            { type: "select", name: "companyId", label: "Empresa", options: companies.map((c) => ({ value: c.id, label: c.name })) },
          ]}
        />
        {data.rows.length === 0 ? (
          <EmptyState icon={<Users />} title="Sin usuarios" description="No hay usuarios que coincidan con los filtros." />
        ) : (
          <>
            <TableContainer>
              <Table data-testid="users-table">
                <THead>
                  <tr>
                    <TH>Nombre</TH>
                    <TH className="hidden md:table-cell">Empresa</TH>
                    <TH>Rol</TH>
                    <TH>Estado</TH>
                    <TH className="hidden lg:table-cell text-right">Proyectos</TH>
                    <TH className="hidden xl:table-cell">Último acceso</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.rows.map((u) => (
                    <TR key={u.id} data-testid="user-row">
                      <TD>
                        <Link href={`/admin/contratistas/${u.id}`} className="font-medium text-ink-900 hover:text-action-700 hover:underline">
                          {u.fullName}
                        </Link>
                        <span className="block text-[0.75rem] text-ink-500">{u.email}</span>
                      </TD>
                      <TD className="hidden md:table-cell">{u.company?.name ?? "—"}</TD>
                      <TD>
                        <RoleBadge role={u.roleKey} />
                      </TD>
                      <TD>
                        <StatusBadge kind="user" value={u.status} />
                      </TD>
                      <TD className="hidden text-right lg:table-cell" data-numeric>
                        {u._count.projects}
                      </TD>
                      <TD className="hidden whitespace-nowrap text-ink-600 xl:table-cell">{formatDateTime(u.lastLoginAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => queryHref("/admin/contratistas", sp, p)} />
          </>
        )}
      </Panel>
    </>
  );
}
