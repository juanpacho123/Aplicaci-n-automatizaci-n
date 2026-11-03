"use client";
import * as React from "react";
import { ChevronRight, Folder, FolderOpen, Lock, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Field, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/client/api";
import { CreateFolderDialog } from "./create-folder-dialog";
import type { FolderView, ProjectDetail, ProjectOption } from "./types";

type Props = {
  projects: ProjectOption[];
  projectId: string | null;
  onProjectChange: (id: string | null) => void;
  view: FolderView | null;
  onViewChange: (view: FolderView | null) => void;
  disabled?: boolean;
  initialFolderId?: string | null;
  /** Solo administrador: ubicación concreta del proyecto. */
  locationId?: string | null;
};

/**
 * Selectores dependientes: Proyecto → Etapa → Carpeta. Consulta las carpetas reales
 * de la ubicación y permite navegar por niveles y crear subcarpetas.
 */
export function DestinationPicker({ projects, projectId, onProjectChange, view, onViewChange, disabled, initialFolderId, locationId }: Props) {
  const loc = locationId ? `&locationId=${encodeURIComponent(locationId)}` : "";
  const [detailState, setDetailState] = React.useState<{ pid: string; data: ProjectDetail | null; error: string | null } | null>(null);
  const detail = detailState && detailState.pid === projectId ? detailState.data : null;
  const loadingDetail = Boolean(projectId) && detailState?.pid !== projectId;
  const [loadingFolder, setLoadingFolder] = React.useState(false);
  const [folderError, setError] = React.useState<string | null>(null);
  const error = folderError ?? (detailState?.pid === projectId ? detailState.error : null);
  const initialFolder = React.useRef(initialFolderId ?? null);

  const loadFolder = React.useCallback(
    async (pid: string, itemId: string) => {
      setLoadingFolder(true);
      setError(null);
      try {
        onViewChange(await api<FolderView>(`/api/projects/${pid}/folders?itemId=${encodeURIComponent(itemId)}${loc}`));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoadingFolder(false);
      }
    },
    [onViewChange, loc],
  );

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api<ProjectDetail>(`/api/projects/${projectId}${loc ? `?${loc.slice(1)}` : ""}`)
      .then((d) => {
        if (cancelled) return;
        setDetailState({ pid: projectId, data: d, error: null });
        if (initialFolder.current) {
          const id = initialFolder.current;
          initialFolder.current = null;
          void loadFolder(projectId, id);
        }
      })
      .catch((err) => !cancelled && setDetailState({ pid: projectId, data: null, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [projectId, loc, loadFolder]);

  function changeProject(id: string | null) {
    onViewChange(null);
    setError(null);
    onProjectChange(id);
  }

  const project = projects.find((p) => p.id === projectId) ?? null;
  const stageKey = view?.stage?.key ?? null;
  // Migas desde la etapa (el nivel de proyecto se elige con el selector).
  const crumbs = view ? view.breadcrumbs.slice(1) : [];

  return (
    <div className="space-y-4">
      <Field label="1. Proyecto" htmlFor="project-select">
        <Select id="project-select" value={projectId ?? ""} onChange={(e) => changeProject(e.target.value || null)} disabled={disabled} data-testid="project-select">
          <option value="">Seleccione un proyecto…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.hasLocation}>
              {p.code} · {p.name}
              {!p.hasLocation ? " (sin ubicación configurada)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      {project && !project.hasLocation ? <Alert tone="warning">El proyecto no tiene ubicación de SharePoint configurada. Contacte al administrador.</Alert> : null}

      <div>
        <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">2. Etapa</p>
        {loadingDetail ? (
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Etapa del proyecto">
            {(detail?.stages ?? [{ key: "inicio", label: "Inicio" }, { key: "ejecucion", label: "Ejecución" }, { key: "cierre", label: "Cierre" }].map((s, i) => ({ ...s, order: i + 1, available: false, folderId: null, folderName: null }))).map((s) => {
              const active = stageKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled || !s.available || !projectId}
                  onClick={() => projectId && s.folderId && loadFolder(projectId, s.folderId)}
                  title={s.available ? s.folderName ?? undefined : "Etapa no configurada en SharePoint"}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-[0.8125rem] font-medium transition-colors",
                    active ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink-800 hover:border-ink-400 hover:bg-subtle",
                    "disabled:cursor-not-allowed disabled:border-line disabled:bg-subtle disabled:text-ink-400",
                  )}
                  data-testid={`stage-${s.key}`}
                >
                  <span className="text-2xs opacity-70" data-numeric>{s.order}.</span> {s.label}
                </button>
              );
            })}
          </div>
        )}
        {detail && detail.stages.some((s) => !s.available) ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-warning-800">
            <AlertTriangle className="size-3.5" aria-hidden /> Algunas etapas no están identificadas en SharePoint; el administrador debe verificar la estructura.
          </p>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[0.8125rem] font-medium text-ink-800">3. Carpeta</p>
          {view ? (
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => projectId && loadFolder(projectId, view.folder.id)} aria-label="Actualizar carpetas" disabled={loadingFolder}>
              <RefreshCw className={cn(loadingFolder && "animate-spin")} />
            </Button>
          ) : null}
        </div>
        <div className="rounded-md border border-line">
          {view ? (
            <nav className="flex flex-wrap items-center gap-1 border-b border-line bg-subtle px-3 py-2 text-[0.8125rem]" aria-label="Ubicación">
              {crumbs.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 ? <ChevronRight className="size-3.5 text-ink-400" aria-hidden /> : null}
                  {i === crumbs.length - 1 ? (
                    <span className="font-medium text-ink-900" aria-current="location">{c.name}</span>
                  ) : (
                    <button type="button" className="text-action-600 hover:underline" onClick={() => projectId && loadFolder(projectId, c.id)} disabled={disabled}>
                      {c.name}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </nav>
          ) : null}
          <div className="max-h-72 min-h-28 overflow-y-auto" data-testid="folder-list">
            {loadingFolder ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-7" />
                <Skeleton className="h-7 w-4/5" />
                <Skeleton className="h-7 w-3/5" />
              </div>
            ) : error ? (
              <div className="p-3">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : !view ? (
              <EmptyState icon={<Folder />} title="Seleccione proyecto y etapa" description="Se mostrarán las carpetas existentes en SharePoint." className="py-6" />
            ) : view.children.filter((c) => c.isFolder).length === 0 ? (
              <EmptyState icon={<FolderOpen />} title="Sin subcarpetas" description="Puede cargar aquí o crear una nueva carpeta." className="py-6" />
            ) : (
              <ul className="divide-y divide-line">
                {view.children
                  .filter((c) => c.isFolder)
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => projectId && loadFolder(projectId, c.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] hover:bg-subtle disabled:opacity-60"
                        data-testid="folder-entry"
                      >
                        <Folder className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-ink-900">{c.name}</span>
                        {c.isProtected ? <Lock className="size-3.5 text-ink-400" aria-label="Carpeta de la estructura principal" /> : null}
                        {c.createdInPortal ? <span className="hidden text-2xs text-ink-500 sm:inline">Creada en el portal</span> : null}
                        <ChevronRight className="size-4 text-ink-400" aria-hidden />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          {view ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
              <span className="text-[0.75rem] text-ink-500">Los documentos se cargarán en la carpeta actual.</span>
              <CreateFolderDialog view={view} locationId={locationId} onCreated={(c) => projectId && loadFolder(projectId, c.folder.id)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
