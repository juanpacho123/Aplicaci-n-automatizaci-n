import { PageHeader } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { FilterBar } from "@/components/shared/filter-bar";
import { HistoryTable, queryHref } from "@/components/shared/history-table";
import { FILE_STATUS_OPTIONS as STATUS_OPTIONS } from "@/components/shared/options";
import { requirePageAuth } from "@/lib/authz/guards";
import { HistoryFilterSchema, listDocumentHistory } from "@/lib/services/history.service";
import { listAccessibleProjects } from "@/lib/services/projects.service";

export const metadata = { title: "Historial de documentos" };


export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageAuth("history:read:own");
  const sp = await searchParams;
  const parsed = HistoryFilterSchema.safeParse(sp);
  const filter = parsed.success ? { ...parsed.data, userId: undefined, companyId: undefined } : { page: 1 };
  const [data, projects] = await Promise.all([listDocumentHistory(ctx, filter), listAccessibleProjects(ctx)]);
  return (
    <>
      <PageHeader title="HISTORIAL DE DOCUMENTOS" description="Registro de sus cargas documentales y su resultado en SharePoint." />
      <Panel>
        <FilterBar
          resetHref="/historial"
          values={sp}
          fields={[
            { type: "search", name: "q", placeholder: "Buscar por nombre de documento" },
            { type: "select", name: "projectId", label: "Proyecto", options: projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) },
            { type: "select", name: "status", label: "Estado", options: STATUS_OPTIONS },
            { type: "date", name: "from", label: "Desde" },
            { type: "date", name: "to", label: "Hasta" },
          ]}
        />
        <HistoryTable {...data} showContractor={false} detailBase="/historial" hrefFor={(p) => queryHref("/historial", sp, p)} />
      </Panel>
    </>
  );
}
