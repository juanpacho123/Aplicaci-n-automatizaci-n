import { Building2 } from "lucide-react";
import { LinkTabs, PageHeader } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { CompanyDialog } from "@/components/admin/user-management";
import { requirePageAuth } from "@/lib/authz/guards";
import { db } from "@/lib/db/prisma";
import { listCompanies } from "@/lib/services/users.service";

export const metadata = { title: "Empresas" };

export default async function CompaniesPage() {
  const ctx = await requirePageAuth("companies:manage");
  const [companies, users] = await Promise.all([listCompanies(ctx), db.user.count()]);
  return (
    <>
      <PageHeader title="Contratistas" description="Empresas contratistas registradas." actions={<CompanyDialog />} />
      <LinkTabs
        active="empresas"
        tabs={[
          { key: "usuarios", label: "Usuarios", href: "/admin/contratistas", count: users },
          { key: "empresas", label: "Empresas", href: "/admin/contratistas/empresas", count: companies.length },
        ]}
      />
      <Panel>
        {companies.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Sin empresas" description="Registre las empresas contratistas para agrupar a sus usuarios." />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Empresa</TH>
                  <TH className="hidden md:table-cell">Identificación</TH>
                  <TH className="hidden md:table-cell">Contacto</TH>
                  <TH className="text-right">Usuarios</TH>
                  <TH className="hidden sm:table-cell text-right">Ubicaciones propias</TH>
                  <TH className="w-24">
                    <span className="sr-only">Acciones</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {companies.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-ink-900">{c.name}</TD>
                    <TD className="hidden md:table-cell">{c.taxId ?? "—"}</TD>
                    <TD className="hidden md:table-cell">{c.contactEmail ?? "—"}</TD>
                    <TD className="text-right" data-numeric>
                      {c._count.users}
                    </TD>
                    <TD className="hidden text-right sm:table-cell" data-numeric>
                      {c._count.locations}
                    </TD>
                    <TD>
                      <CompanyDialog company={c} />
                    </TD>
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
