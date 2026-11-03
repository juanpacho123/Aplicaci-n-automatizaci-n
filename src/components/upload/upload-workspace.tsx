"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, CircleSlash, ExternalLink, File as FileIcon, FileImage, FileSpreadsheet, FileText, FileArchive, RotateCcw, Trash2, UploadCloud, X, XCircle, Loader2, FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Progress } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { runPool, uploadFile, type DoneResult } from "@/lib/client/upload-engine";
import { fileExtension, formatBytes, sameName, validateFileCandidate, validateItemName } from "@/lib/validation/names";
import { DestinationPicker } from "./destination-picker";
import type { FolderView, ProjectOption, UploadRules } from "./types";

type ItemStatus = "ready" | "invalid" | "conflict" | "queued" | "uploading" | "retrying" | "success" | "error" | "cancelled" | "skipped";

type QueueItem = {
  key: string;
  file: File;
  finalName: string;
  status: ItemStatus;
  errors: string[];
  bytes: number;
  conflict: { existingId: string; isFolder: boolean; size: number; modifiedAt: string | null; modifiedBy: string | null } | null;
  suggestedName: string | null;
  behavior: "FAIL" | "REPLACE" | "RENAME";
  fileId?: string;
  result?: DoneResult;
  message?: string;
};

type PreflightResult = {
  canReplace: boolean;
  files: { name: string; valid: boolean; errors: string[]; conflict: QueueItem["conflict"]; suggestedName: string | null }[];
};

const keyOf = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;

function iconFor(name: string) {
  const ext = fileExtension(name);
  if (["xls", "xlsx", "xlsm", "csv"].includes(ext)) return FileSpreadsheet;
  if (["jpg", "jpeg", "png", "tif", "tiff"].includes(ext)) return FileImage;
  if (["zip"].includes(ext)) return FileArchive;
  if (["pdf", "doc", "docx", "txt", "ppt", "pptx"].includes(ext)) return FileText;
  return FileIcon;
}

const STATUS_VIEW: Record<ItemStatus, { label: string; tone: "neutral" | "info" | "success" | "danger" | "warning" }> = {
  ready: { label: "Listo", tone: "neutral" },
  invalid: { label: "No válido", tone: "danger" },
  conflict: { label: "Nombre duplicado", tone: "warning" },
  queued: { label: "Pendiente", tone: "neutral" },
  uploading: { label: "En proceso", tone: "info" },
  retrying: { label: "Reintentando", tone: "warning" },
  success: { label: "Cargado correctamente", tone: "success" },
  error: { label: "Error", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  skipped: { label: "Omitido", tone: "neutral" },
};

export function UploadWorkspace({ projects, rules, storage, canReplaceDefault }: { projects: ProjectOption[]; rules: UploadRules; storage: "demo" | "sharepoint"; canReplaceDefault: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const initialProject = search.get("proyecto");
  const locationId = search.get("ubicacion");
  const [projectId, setProjectId] = React.useState<string | null>(initialProject && projects.some((p) => p.id === initialProject) ? initialProject : projects.length === 1 && projects[0].hasLocation ? projects[0].id : null);
  const [view, setView] = React.useState<FolderView | null>(null);
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [phase, setPhase] = React.useState<"select" | "uploading" | "done">("select");
  const [canReplace, setCanReplace] = React.useState(canReplaceDefault);
  const [checking, setChecking] = React.useState(false);
  const [conflictOpen, setConflictOpen] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const controllers = React.useRef(new Map<string, AbortController>());
  const dragDepth = React.useRef(0);

  const busy = phase === "uploading";
  const destinationReady = Boolean(view && view.capabilities.canUpload);
  const pending = items.filter((i) => !["skipped", "success", "cancelled"].includes(i.status));
  const uploadable = items.filter((i) => i.status === "ready" || i.status === "conflict");
  const unresolved = items.filter((i) => i.status === "conflict" && i.behavior === "FAIL");
  const totalBytes = pending.reduce((s, i) => s + i.file.size, 0);

  const update = React.useCallback((key: string, patch: Partial<QueueItem> | ((i: QueueItem) => Partial<QueueItem>)) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...(typeof patch === "function" ? patch(i) : patch) } : i)));
  }, []);

  // Sincroniza la URL con el destino (enlaces directos a una carpeta).
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set("proyecto", projectId);
    if (view) params.set("carpeta", view.folder.id);
    if (locationId) params.set("ubicacion", locationId);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [projectId, view, locationId]);

  function addFiles(list: FileList | File[]) {
    if (busy) return;
    if (phase === "done") {
      setItems([]);
      setPhase("select");
    }
    const incoming = Array.from(list);
    setItems((prev) => {
      const existing = new Set(prev.map((p) => p.key));
      const added: QueueItem[] = [];
      for (const file of incoming) {
        const key = keyOf(file);
        if (existing.has(key)) continue;
        existing.add(key);
        const errors = validateFileCandidate(file, rules);
        added.push({ key, file, finalName: file.name, status: errors.length ? "invalid" : "ready", errors, bytes: 0, conflict: null, suggestedName: null, behavior: "FAIL" });
      }
      const next = [...prev, ...added];
      if (next.length > rules.maxFilesPerOperation) toast.warning(`Máximo ${rules.maxFilesPerOperation} archivos por operación.`);
      return next.slice(0, rules.maxFilesPerOperation);
    });
  }

  // Verificación previa en el servidor cuando cambian archivos o destino.
  const signature = items.map((i) => `${i.key}|${i.status === "invalid"}`).join(",");
  React.useEffect(() => {
    if (!view || !view.capabilities.canUpload || phase !== "select") return;
    const candidates = items.filter((i) => i.status !== "invalid" && i.status !== "skipped");
    if (candidates.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api<PreflightResult>("/api/uploads/preflight", {
          method: "POST",
          json: { projectId: view.project.id, locationId, folderItemId: view.folder.id, files: candidates.map((c) => ({ name: c.file.name, size: c.file.size })) },
        });
        if (cancelled) return;
        setCanReplace(res.canReplace);
        setItems((prev) =>
          prev.map((i) => {
            const idx = candidates.findIndex((c) => c.key === i.key);
            if (idx < 0) return i;
            const r = res.files[idx];
            if (!r.valid && !r.conflict) return { ...i, status: "invalid", errors: r.errors };
            if (r.conflict) return { ...i, status: "conflict", errors: [], conflict: r.conflict, suggestedName: r.suggestedName, behavior: i.conflict ? i.behavior : "FAIL", finalName: i.conflict ? i.finalName : i.file.name };
            return { ...i, status: "ready", errors: [], conflict: null, behavior: "FAIL", finalName: i.file.name };
          }),
        );
      } catch (err) {
        if (!cancelled) setGlobalError(errorMessage(err));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, view?.folder.id, phase]);

  async function startUpload() {
    if (!view) return;
    setGlobalError(null);
    if (unresolved.length) {
      setConflictOpen(true);
      return;
    }
    const batch = items.filter((i) => i.status === "ready" || (i.status === "conflict" && i.behavior !== "FAIL"));
    if (batch.length === 0) return;
    setPhase("uploading");
    let created: { operationId: string; chunkSize: number; maxRetries: number; parallelUploads: number; files: { clientKey: string; fileId: string; finalName: string }[] };
    try {
      created = await api("/api/uploads", {
        method: "POST",
        json: {
          projectId: view.project.id,
          locationId,
          folderItemId: view.folder.id,
          files: batch.map((i) => ({ clientKey: i.key, originalName: i.file.name, finalName: i.finalName, size: i.file.size, mimeType: i.file.type || null, conflictBehavior: i.behavior })),
        },
      });
    } catch (err) {
      setPhase("select");
      if (err instanceof ApiError && err.code === "CONFLICT" && Array.isArray(err.details?.problems)) {
        const problems = err.details.problems as { clientKey: string; error: string; suggestedName?: string }[];
        setItems((prev) =>
          prev.map((i) => {
            const p = problems.find((x) => x.clientKey === i.key);
            return p ? { ...i, status: p.suggestedName ? "conflict" : "invalid", errors: [p.error], suggestedName: p.suggestedName ?? i.suggestedName, behavior: "FAIL", finalName: i.file.name } : i;
          }),
        );
        setGlobalError("Algunos archivos cambiaron en el destino. Revise los marcados antes de continuar.");
      } else setGlobalError(errorMessage(err));
      return;
    }

    const byKey = new Map(created.files.map((f) => [f.clientKey, f]));
    setItems((prev) => prev.map((i) => (byKey.has(i.key) ? { ...i, status: "queued", fileId: byKey.get(i.key)!.fileId, bytes: 0, message: undefined } : i)));

    await runPool(batch, created.parallelUploads, async (item) => {
      const info = byKey.get(item.key)!;
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      update(item.key, { status: "uploading" });
      try {
        const result = await uploadFile(
          { fileId: info.fileId, blob: item.file, size: item.file.size },
          {
            chunkSize: created.chunkSize,
            maxRetries: created.maxRetries,
            signal: controller.signal,
            onProgress: (bytes) => update(item.key, (i) => ({ bytes, status: i.status === "retrying" ? "uploading" : i.status })),
            onRetry: (attempt, reason) => update(item.key, { status: "retrying", message: `Intento ${attempt + 1} de ${created.maxRetries + 1}: ${reason}` }),
          },
        );
        update(item.key, { status: "success", bytes: item.file.size, result, message: undefined, finalName: result.item.name });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          await api(`/api/uploads/files/${info.fileId}/cancel`, { method: "POST" }).catch(() => undefined);
          update(item.key, { status: "cancelled", message: "Carga cancelada por el usuario." });
        } else {
          update(item.key, { status: "error", message: errorMessage(err) });
        }
      } finally {
        controllers.current.delete(item.key);
      }
    });
    setPhase("done");
    router.refresh();
  }

  async function retryItem(item: QueueItem) {
    if (!item.fileId) return;
    const controller = new AbortController();
    controllers.current.set(item.key, controller);
    update(item.key, { status: "uploading", bytes: 0, message: undefined });
    try {
      const result = await uploadFile(
        { fileId: item.fileId, blob: item.file, size: item.file.size },
        { chunkSize: rules.chunkSizeKB * 1024, maxRetries: rules.maxRetries, signal: controller.signal, onProgress: (bytes) => update(item.key, { bytes }), onRetry: (a, r) => update(item.key, { status: "retrying", message: `Reintento ${a}: ${r}` }) },
      );
      update(item.key, { status: "success", result, bytes: item.file.size, message: undefined });
    } catch (err) {
      update(item.key, err instanceof DOMException && err.name === "AbortError" ? { status: "cancelled" } : { status: "error", message: errorMessage(err) });
    } finally {
      controllers.current.delete(item.key);
    }
  }

  const finished = items.filter((i) => i.fileId);
  const summary = {
    success: finished.filter((i) => i.status === "success").length,
    error: finished.filter((i) => i.status === "error").length,
    cancelled: finished.filter((i) => i.status === "cancelled").length,
  };

  return (
    <div className="grid gap-5 pb-28 lg:grid-cols-12 lg:pb-0">
      <Panel className="lg:col-span-5 xl:col-span-4">
        <PanelHeader title="Destino documental" description="Proyecto, etapa y carpeta de SharePoint." />
        <div className="px-4 py-4 sm:px-5">
          <DestinationPicker projects={projects} projectId={projectId} onProjectChange={setProjectId} view={view} onViewChange={setView} disabled={busy} initialFolderId={search.get("carpeta")} locationId={locationId} />
          {view && !view.capabilities.canUpload ? (
            <Alert tone="info" className="mt-4">
              {view.stage ? "Su rol no permite cargar documentos en esta ubicación." : "Seleccione una etapa para elegir la carpeta de destino."}
            </Alert>
          ) : null}
        </div>
      </Panel>

      <div className="space-y-5 lg:col-span-7 xl:col-span-8">
        {storage === "demo" ? (
          <Alert tone="warning" title="Modo demostración">
            Los archivos se guardarán en el almacenamiento local de prueba. No se cargarán en SharePoint.
          </Alert>
        ) : null}
        {globalError ? <Alert tone="danger">{globalError}</Alert> : null}

        <Panel>
          <div
            className={cn(
              "m-3 flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-9 text-center transition-colors sm:m-4",
              dragging ? "border-action-600 bg-action-50" : "border-line-strong bg-subtle",
              busy && "pointer-events-none opacity-60",
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepth.current++;
              setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            data-testid="dropzone"
          >
            <UploadCloud className="size-8 text-brand-600" aria-hidden />
            <p className="mt-2 text-sm font-medium text-ink-900">Arrastre y suelte los documentos aquí</p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-500">
              o{" "}
              <button type="button" className="font-medium text-action-600 hover:underline" onClick={() => inputRef.current?.click()} disabled={busy}>
                seleccione archivos
              </button>{" "}
              desde su equipo
            </p>
            <p className="mt-3 text-[0.75rem] text-ink-500">
              Máximo {rules.maxFilesPerOperation} archivos · hasta {formatBytes(rules.maxFileSizeMB * 1024 * 1024)} por archivo · {rules.allowedExtensions.map((e) => e.toUpperCase()).join(", ")}
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              accept={rules.allowedExtensions.map((e) => `.${e}`).join(",")}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
              data-testid="file-input"
            />
          </div>

          {items.length > 0 ? (
            <div className="border-t border-line">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                <p className="text-[0.8125rem] font-medium text-ink-800" data-testid="queue-count">
                  {items.length} {items.length === 1 ? "documento" : "documentos"} · {formatBytes(items.reduce((s, i) => s + i.file.size, 0))}
                  {checking ? <Loader2 className="ml-2 inline size-3.5 animate-spin text-ink-400" aria-label="Verificando" /> : null}
                </p>
                {!busy && phase === "select" ? (
                  <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                    <Trash2 aria-hidden /> Quitar todos
                  </Button>
                ) : null}
              </div>
              <ul className="divide-y divide-line border-t border-line" data-testid="file-queue">
                {items.map((item) => {
                  const Icon = iconFor(item.file.name);
                  const sv = STATUS_VIEW[item.status];
                  const pct = item.file.size ? (item.bytes / item.file.size) * 100 : 0;
                  return (
                    <li key={item.key} className="px-4 py-3 sm:px-5" data-testid="queue-item" data-status={item.status}>
                      <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 truncate text-[0.8125rem] font-medium text-ink-900" title={item.finalName}>
                              {item.finalName}
                            </span>
                            <Badge tone={sv.tone}>{sv.label}</Badge>
                            {item.behavior === "REPLACE" && item.status !== "success" ? <Badge tone="warning">Reemplazará</Badge> : null}
                          </div>
                          <div className="mt-0.5 text-[0.75rem] text-ink-500" data-numeric>
                            {(fileExtension(item.file.name) || "—").toUpperCase()} · {formatBytes(item.file.size)}
                            {item.finalName !== item.file.name ? <> · original: {item.file.name}</> : null}
                          </div>
                          {["uploading", "retrying", "queued"].includes(item.status) || (item.status === "success" && phase !== "select") ? (
                            <div className="mt-2 flex items-center gap-2">
                              <Progress value={pct} tone={item.status === "success" ? "success" : "action"} label={`Progreso de ${item.finalName}`} />
                              <span className="w-10 text-right text-2xs text-ink-500" data-numeric>
                                {Math.round(pct)}%
                              </span>
                            </div>
                          ) : null}
                          {item.errors.length ? <p className="mt-1 text-[0.75rem] text-danger-700">{item.errors.join(" ")}</p> : null}
                          {item.status === "conflict" && item.behavior === "FAIL" ? <p className="mt-1 text-[0.75rem] text-warning-800">Ya existe un archivo con este nombre en el destino. Elija cómo continuar.</p> : null}
                          {item.message ? <p className={cn("mt-1 text-[0.75rem]", item.status === "error" ? "text-danger-700" : "text-ink-600")}>{item.message}</p> : null}
                          {item.status === "success" && item.result ? (
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.75rem] text-success-800">
                              <CheckCircle2 className="size-3.5" aria-hidden />
                              {item.result.storage === "sharepoint" ? "Verificado en SharePoint" : "Guardado en almacenamiento de demostración"}
                              {item.result.item.webUrl ? (
                                <a href={item.result.item.webUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-action-600 hover:underline">
                                  Abrir <ExternalLink className="size-3" aria-hidden />
                                </a>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {phase === "select" && item.status === "conflict" ? (
                            <Button size="sm" variant="secondary" onClick={() => setConflictOpen(true)}>
                              Resolver
                            </Button>
                          ) : null}
                          {phase === "select" ? (
                            <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${item.file.name}`} onClick={() => setItems((prev) => prev.filter((p) => p.key !== item.key))}>
                              <X />
                            </Button>
                          ) : null}
                          {["uploading", "retrying", "queued"].includes(item.status) ? (
                            <Button size="icon-sm" variant="ghost" aria-label={`Cancelar ${item.file.name}`} onClick={() => controllers.current.get(item.key)?.abort()} disabled={item.status === "queued"}>
                              <CircleSlash />
                            </Button>
                          ) : null}
                          {item.status === "error" && item.fileId && phase === "done" ? (
                            <Button size="sm" variant="secondary" onClick={() => retryItem(item)}>
                              <RotateCcw aria-hidden /> Reintentar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Panel>

        {phase === "done" ? (
          <Panel data-testid="upload-summary">
            <PanelHeader
              title="Resultado de la carga"
              description={view ? `${view.project.code} · ${view.relativePath || view.folder.name}` : undefined}
              actions={
                <>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/historial">Ver historial</Link>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setItems([]);
                      setPhase("select");
                    }}
                  >
                    Nueva carga
                  </Button>
                </>
              }
            />
            <div className="grid grid-cols-3 divide-x divide-line">
              <SummaryCell icon={<CheckCircle2 className="text-success-700" />} label="Cargados" value={summary.success} />
              <SummaryCell icon={<XCircle className="text-danger-700" />} label="Con error" value={summary.error} />
              <SummaryCell icon={<CircleSlash className="text-ink-500" />} label="Cancelados" value={summary.cancelled} />
            </div>
          </Panel>
        ) : null}
      </div>

      {/* Resumen de destino: siempre visible (barra fija en móvil, panel en escritorio) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/97 px-4 py-3 shadow-overlay backdrop-blur lg:static lg:col-span-12 lg:rounded-lg lg:border lg:px-5 lg:shadow-xs" data-testid="destination-summary">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-[0.05em] text-ink-500">Destino seleccionado</p>
            {view ? (
              <>
                <p className="truncate text-[0.8125rem] font-medium text-ink-900">
                  {view.project.code} · {view.project.name}
                  {view.stage ? ` · ${view.stage.label}` : ""}
                  {view.breadcrumbs.length > 2 ? ` · ${view.folder.name}` : ""}
                </p>
                <p className="path-text truncate text-ink-600" title={view.fullPath} data-testid="destination-path">
                  {view.fullPath}
                </p>
              </>
            ) : (
              <p className="text-[0.8125rem] text-ink-500">Seleccione proyecto, etapa y carpeta.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[0.8125rem] text-ink-600 sm:inline" data-numeric>
              {uploadable.length} {uploadable.length === 1 ? "documento" : "documentos"} · {formatBytes(totalBytes)}
            </span>
            {storage === "demo" ? <FlaskConical className="size-4 text-warning-700" aria-label="Modo demostración" /> : null}
            <Button variant="primary" size="lg" className="w-full lg:w-auto" disabled={!destinationReady || uploadable.length === 0 || busy || checking} loading={busy} onClick={startUpload} data-testid="upload-button">
              <UploadCloud aria-hidden /> SUBIR DOCUMENTOS
            </Button>
          </div>
        </div>
      </div>

      {conflictOpen ? (
      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        items={items.filter((i) => i.status === "conflict")}
        canReplace={canReplace}
        existingNames={view?.children.map((c) => c.name) ?? []}
        onApply={(decisions) => {
          setItems((prev) =>
            prev.map((i) => {
              const d = decisions[i.key];
              if (!d) return i;
              if (d.behavior === "SKIP") return { ...i, status: "skipped", behavior: "FAIL" };
              return { ...i, behavior: d.behavior, finalName: d.behavior === "RENAME" ? d.name : i.file.name };
            }),
          );
          setConflictOpen(false);
        }}
      />
      ) : null}
    </div>
  );
}

function SummaryCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 sm:px-5 [&_svg]:size-5">
      {icon}
      <div>
        <p className="text-lg font-semibold leading-6 text-ink-950" data-numeric>{value}</p>
        <p className="text-[0.75rem] text-ink-500">{label}</p>
      </div>
    </div>
  );
}

type Decision = { behavior: "SKIP" | "REPLACE" | "RENAME"; name: string };

function ConflictDialog({
  open,
  onOpenChange,
  items,
  canReplace,
  existingNames,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: QueueItem[];
  canReplace: boolean;
  existingNames: string[];
  onApply: (d: Record<string, Decision>) => void;
}) {
  // Se monta al abrir: las decisiones iniciales se calculan una sola vez.
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>(() =>
    Object.fromEntries(items.map((i) => [i.key, { behavior: i.behavior === "FAIL" ? "RENAME" : (i.behavior as Decision["behavior"]), name: i.behavior === "RENAME" ? i.finalName : i.suggestedName ?? i.file.name }])),
  );

  const errors = Object.fromEntries(
    items.map((i) => {
      const d = decisions[i.key];
      if (!d || d.behavior !== "RENAME") return [i.key, null];
      const c = validateItemName(d.name, "file");
      if (!c.ok) return [i.key, c.error];
      if (fileExtension(c.value) !== fileExtension(i.file.name)) return [i.key, "Debe conservar la extensión original."];
      if (existingNames.some((n) => sameName(n, c.value))) return [i.key, "Ese nombre también existe en el destino."];
      const others = items.filter((o) => o.key !== i.key).map((o) => (decisions[o.key]?.behavior === "RENAME" ? decisions[o.key].name : o.file.name));
      if (others.some((n) => sameName(n, c.value))) return [i.key, "Nombre repetido en la selección."];
      return [i.key, null];
    }),
  );
  const valid = Object.values(errors).every((e) => !e);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title="Archivos con nombre existente" description="No se sobrescribe ningún documento sin su decisión. Elija una opción para cada archivo." />
        <DialogBody className="space-y-4">
          {items.map((i) => {
            const d = decisions[i.key];
            if (!d) return null;
            return (
              <fieldset key={i.key} className="rounded-md border border-line p-3" data-testid="conflict-item">
                <legend className="px-1 text-[0.8125rem] font-medium text-ink-900">{i.file.name}</legend>
                {i.conflict ? (
                  <p className="mb-2 text-[0.75rem] text-ink-500">
                    Existente: {formatBytes(i.conflict.size)}
                    {i.conflict.modifiedBy ? ` · modificado por ${i.conflict.modifiedBy}` : ""}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 text-[0.8125rem]">
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`c-${i.key}`} checked={d.behavior === "SKIP"} onChange={() => setDecisions((p) => ({ ...p, [i.key]: { ...d, behavior: "SKIP" } }))} className="accent-brand-700" />
                    Cancelar este archivo
                  </label>
                  <label className={cn("flex items-center gap-2", !canReplace && "text-ink-400")}>
                    <input type="radio" name={`c-${i.key}`} disabled={!canReplace} checked={d.behavior === "REPLACE"} onChange={() => setDecisions((p) => ({ ...p, [i.key]: { ...d, behavior: "REPLACE" } }))} className="accent-brand-700" />
                    Reemplazar el documento existente {!canReplace ? "(no autorizado para su rol)" : ""}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`c-${i.key}`} checked={d.behavior === "RENAME"} onChange={() => setDecisions((p) => ({ ...p, [i.key]: { ...d, behavior: "RENAME" } }))} className="accent-brand-700" data-testid="conflict-rename" />
                    Cambiar el nombre antes de cargar
                  </label>
                  {d.behavior === "RENAME" ? (
                    <div className="pl-6">
                      <Input value={d.name} onChange={(e) => setDecisions((p) => ({ ...p, [i.key]: { ...d, name: e.target.value } }))} aria-invalid={Boolean(errors[i.key])} data-testid="conflict-new-name" />
                      {errors[i.key] ? <p className="mt-1 text-[0.75rem] text-danger-700">{errors[i.key]}</p> : null}
                    </div>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onApply(decisions)} data-testid="apply-conflicts">
            Aplicar decisiones
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
