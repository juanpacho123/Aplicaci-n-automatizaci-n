import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/page";
import { StatusBadge } from "./status";
import { formatBytes, formatDateTime } from "./format";

type Row = {
  id: string;
  name: string;
  size: number;
  status: string;
  createdAt: string;
  errorMessage: string | null;
  webUrl: string | null;
  contractor: string;
  company: string | null;
  project: { id: string; code: string; name: string };
  stage: string;
  folderPath: string;
  operationId: string;
};

export function HistoryTable({ rows, total, page, pageSize, hrefFor, detailBase, showContractor }: { rows: Row[]; total: number; page: number; pageSize: number; hrefFor: (p: number) => string; detailBase: string; showContractor: boolean }) {
  if (rows.length === 0) return <EmptyState icon={<FileText />} title="Sin registros" description="No hay cargas que coincidan con los filtros seleccionados." />;
  return (
    <>
      <TableContainer>
        <Table data-testid="history-table">
          <THead>
            <tr>
              <TH>Documento</TH>
              {showContractor ? <TH>Contratista</TH> : null}
              {showContractor ? <TH className="hidden xl:table-cell">Empresa</TH> : null}
              <TH>Proyecto</TH>
              <TH className="hidden md:table-cell">Etapa</TH>
              <TH className="hidden lg:table-cell">Carpeta de destino</TH>
              <TH>Fecha y hora</TH>
              <TH className="hidden sm:table-cell text-right">Tamaño</TH>
              <TH>Estado</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id} data-testid="history-row">
                <TD className="max-w-64">
                  <Link href={`${detailBase}/${r.operationId}`} className="block truncate font-medium text-ink-900 hover:text-action-700 hover:underline" title={r.name}>
                    {r.name}
                  </Link>
                  {r.errorMessage && r.status === "ERROR" ? <span className="block truncate text-[0.75rem] text-danger-700" title={r.errorMessage}>{r.errorMessage}</span> : null}
                </TD>
                {showContractor ? <TD className="whitespace-nowrap">{r.contractor}</TD> : null}
                {showContractor ? <TD className="hidden whitespace-nowrap xl:table-cell">{r.company ?? "—"}</TD> : null}
                <TD className="whitespace-nowrap" title={r.project.name}>
                  {r.project.code}
                </TD>
                <TD className="hidden whitespace-nowrap md:table-cell">{r.stage}</TD>
                <TD className="hidden max-w-72 lg:table-cell">
                  <span className="path-text block truncate text-ink-600" title={r.folderPath}>
                    {r.folderPath}
                  </span>
                </TD>
                <TD className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt)}</TD>
                <TD className="hidden whitespace-nowrap text-right sm:table-cell" data-numeric>
                  {formatBytes(r.size)}
                </TD>
                <TD className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <StatusBadge kind="file" value={r.status} />
                    {r.webUrl ? (
                      <a href={r.webUrl} target="_blank" rel="noreferrer noopener" aria-label={`Abrir ${r.name} en SharePoint`} className="text-action-600">
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableContainer>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor} />
    </>
  );
}

export function queryHref(base: string, params: Record<string, string | undefined>, page: number) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "page") qs.set(k, v);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
