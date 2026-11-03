import { ExternalLink } from "lucide-react";
import { Panel, PanelHeader, PanelBody, DescriptionList } from "@/components/ui/panel";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./status";
import { formatBytes, formatDateTime } from "./format";
import type { operationDetail } from "@/lib/services/history.service";

type Detail = Awaited<ReturnType<typeof operationDetail>>;
const BEHAVIOR: Record<string, string> = { FAIL: "Nuevo", REPLACE: "Reemplazo", RENAME: "Renombrado" };

export function OperationDetailView({ op }: { op: Detail }) {
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Detalle de la operación" actions={<StatusBadge kind="operation" value={op.status} />} />
        <PanelBody>
          <DescriptionList
            items={[
              { label: "Contratista", value: `${op.user.fullName} (${op.user.email})` },
              { label: "Empresa", value: op.user.company?.name ?? "—" },
              { label: "Proyecto", value: `${op.project.code} · ${op.project.name}` },
              { label: "Etapa", value: op.stage },
              { label: "Carpeta de destino", value: <span className="path-text">{op.folderPath}</span> },
              { label: "Almacenamiento", value: op.environment === "DEMO" ? <Badge tone="warning">Demostración (local)</Badge> : <Badge tone="brand">SharePoint Online</Badge> },
              { label: "Iniciada", value: formatDateTime(op.createdAt) },
              { label: "Finalizada", value: formatDateTime(op.completedAt) },
              { label: "Resultado", value: `${op.totals.success} cargados · ${op.totals.error} con error · ${op.totals.cancelled} cancelados de ${op.totals.total}` },
            ]}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Documentos" />
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Documento</TH>
                <TH className="hidden md:table-cell">Tipo de carga</TH>
                <TH className="text-right">Tamaño</TH>
                <TH className="hidden sm:table-cell">Intentos</TH>
                <TH>Estado</TH>
                <TH className="hidden lg:table-cell">Verificación</TH>
              </tr>
            </THead>
            <tbody>
              {op.files.map((f) => (
                <TR key={f.id}>
                  <TD className="max-w-80">
                    <span className="block truncate font-medium text-ink-900">{f.finalName}</span>
                    {f.finalName !== f.originalName ? <span className="block truncate text-[0.75rem] text-ink-500">Original: {f.originalName}</span> : null}
                    {f.errorMessage ? <span className="block text-[0.75rem] text-danger-700">{f.errorMessage}</span> : null}
                  </TD>
                  <TD className="hidden md:table-cell">{BEHAVIOR[f.conflictBehavior]}</TD>
                  <TD className="whitespace-nowrap text-right" data-numeric>
                    {formatBytes(f.size)}
                  </TD>
                  <TD className="hidden sm:table-cell" data-numeric>
                    {f.attempts}
                  </TD>
                  <TD>
                    <StatusBadge kind="file" value={f.status} />
                  </TD>
                  <TD className="hidden whitespace-nowrap lg:table-cell">
                    {f.verifiedAt ? (
                      <span className="inline-flex items-center gap-2 text-ink-600">
                        {formatDateTime(f.verifiedAt)}
                        {f.webUrl ? (
                          <a href={f.webUrl} target="_blank" rel="noreferrer noopener" className="text-action-600" aria-label="Abrir en SharePoint">
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Panel>
    </div>
  );
}
