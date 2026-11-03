import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FolderBrowser } from "@/components/shared/folder-browser";
import { requirePageAuth } from "@/lib/authz/guards";
import { isAppError } from "@/lib/http/errors";
import { projectDetail } from "@/lib/services/projects.service";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ carpeta?: string }> }) {
  const ctx = await requirePageAuth("project:read");
  const { projectId } = await params;
  const { carpeta } = await searchParams;
  let detail: Awaited<ReturnType<typeof projectDetail>>;
  try {
    detail = await projectDetail(ctx, projectId);
  } catch (err) {
    return (
      <Alert tone="danger" title="No es posible abrir el proyecto">
        {isAppError(err) ? err.message : "Error inesperado."}
      </Alert>
    );
  }
  return (
    <>
      <Link href="/proyectos" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-600 hover:text-ink-900">
        <ChevronLeft className="size-4" aria-hidden /> Mis proyectos
      </Link>
      <PageHeader eyebrow={detail.project.code} title={detail.project.name} description={detail.project.description ?? undefined} />
      {!detail.location ? (
        <Alert tone="warning">El proyecto aún no tiene una ubicación de SharePoint configurada por el administrador.</Alert>
      ) : (
        <div className="grid gap-5 lg:grid-cols-4">
          <Panel className="lg:col-span-1">
            <PanelHeader title="Etapas" />
            <ul className="divide-y divide-line">
              {detail.stages.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[0.8125rem]">
                  {s.available ? (
                    <Link href={`/proyectos/${projectId}?carpeta=${encodeURIComponent(s.folderId!)}`} className="font-medium text-ink-900 hover:text-action-700">
                      {s.order}. {s.label}
                    </Link>
                  ) : (
                    <span className="text-ink-400">
                      {s.order}. {s.label}
                    </span>
                  )}
                  {!s.available ? <Badge tone="warning">No identificada</Badge> : null}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="lg:col-span-3">
            <FolderBrowser key={carpeta ?? "root"} projectId={projectId} initialItemId={carpeta ?? null} />
          </Panel>
        </div>
      )}
    </>
  );
}
