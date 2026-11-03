import { Inbox } from "lucide-react";
import { PageHeader, Pagination } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/shared/filter-bar";
import { queryHref } from "@/components/shared/history-table";
import { StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { RequestActions } from "@/components/admin/requests";
import { requirePageAuth } from "@/lib/authz/guards";
import { isDemoMode } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";
import { listAccessRequests, RequestFilterSchema } from "@/lib/services/access-requests.service";

export const metadata = { title: "Solicitudes de acceso" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageAuth("requests:manage");
  const sp = await searchParams;
  const parsed = RequestFilterSchema.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)));
  const [data, projects, companies] = await Promise.all([
    listAccessRequests(ctx, parsed.success ? parsed.data : { page: 1 }),
    db.project.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true } }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Solicitudes de acceso" description="Ninguna solicitud se convierte en autorización sin la aprobación explícita del administrador." />
      <Panel>
        <FilterBar
          resetHref="/admin/solicitudes"
          values={sp}
          fields={[
            { type: "search", name: "q", placeholder: "Buscar por nombre, correo o empresa" },
            {
              type: "select",
              name: "status",
              label: "Estado",
              options: [
                { value: "PENDING", label: "Pendiente" },
                { value: "INFO_REQUESTED", label: "Información solicitada" },
                { value: "APPROVED", label: "Aprobada" },
                { value: "REJECTED", label: "Rechazada" },
              ],
            },
          ]}
        />
        {data.rows.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Sin solicitudes" description="Las solicitudes públicas de acceso aparecerán aquí." />
        ) : (
          <ul className="divide-y divide-line" data-testid="requests-list">
            {data.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start" data-testid="request-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{r.fullName}</span>
                    <StatusBadge kind="request" value={r.status} />
                    {r.existingUser ? <Badge tone="warning">Correo ya registrado</Badge> : null}
                  </div>
                  <p className="text-[0.8125rem] text-ink-600">
                    {r.email} · {r.companyName}
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-ink-800">
                    <span className="text-ink-500">Proyecto solicitado:</span> {r.requestedProject}
                  </p>
                  {r.justification ? <p className="mt-1 max-w-3xl text-[0.8125rem] text-ink-600">{r.justification}</p> : null}
                  {r.infoRequestedMessage ? <p className="mt-1 text-[0.75rem] text-action-700">Información solicitada: {r.infoRequestedMessage}</p> : null}
                  {r.additionalInfo ? <p className="mt-1 whitespace-pre-line rounded-sm bg-subtle px-2 py-1 text-[0.75rem] text-ink-700">Respuesta: {r.additionalInfo}</p> : null}
                  {r.reviewNotes ? <p className="mt-1 text-[0.75rem] text-ink-500">Notas: {r.reviewNotes}</p> : null}
                  <p className="mt-1 text-[0.75rem] text-ink-500">Recibida {formatDateTime(r.createdAt)}{r.reviewedAt ? ` · Revisada ${formatDateTime(r.reviewedAt)}` : ""}</p>
                </div>
                {r.status === "PENDING" || r.status === "INFO_REQUESTED" ? <RequestActions request={r} projects={projects} companies={companies} demo={isDemoMode()} disabled={Boolean(r.existingUser)} /> : null}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => queryHref("/admin/solicitudes", sp, p)} />
      </Panel>
    </>
  );
}
