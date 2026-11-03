"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Folder, FolderPlus, Link2, Pencil, Plus, RefreshCw, Trash2, CornerLeftUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { useAction, type CompanyChoice } from "./user-management";

type ProjectData = { id: string; code: string; name: string; description: string | null; status: string };

export function ProjectFormDialog({ project }: { project?: ProjectData }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { code: fd.get("code"), name: fd.get("name"), description: fd.get("description"), status: fd.get("status") ?? "ACTIVE" };
    const ok = await run(() => api(project ? `/api/admin/projects/${project.id}` : "/api/admin/projects", { method: project ? "PATCH" : "POST", json: body }), project ? "Proyecto actualizado" : "Proyecto registrado");
    if (ok) setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={project ? "secondary" : "primary"} size={project ? "sm" : "md"} onClick={() => setOpen(true)} data-testid={project ? "edit-project" : "open-create-project"}>
        {project ? <Pencil aria-hidden /> : <Plus aria-hidden />} {project ? "Editar" : "Registrar proyecto"}
      </Button>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title={project ? "Editar proyecto" : "Registrar proyecto"} description="Después de registrarlo, asocie su carpeta de SharePoint." />
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Código" htmlFor="p-code" required className="sm:col-span-1">
                <Input id="p-code" name="code" defaultValue={project?.code} required maxLength={40} data-testid="project-code" />
              </Field>
              <Field label="Nombre" htmlFor="p-name" required className="sm:col-span-2">
                <Input id="p-name" name="name" defaultValue={project?.name} required maxLength={160} data-testid="project-name" />
              </Field>
            </div>
            <Field label="Descripción" htmlFor="p-desc">
              <Textarea id="p-desc" name="description" defaultValue={project?.description ?? ""} rows={3} maxLength={2000} />
            </Field>
            {project ? (
              <Field label="Estado" htmlFor="p-status" hint="Los proyectos archivados dejan de estar disponibles para contratistas.">
                <Select id="p-status" name="status" defaultValue={project.status}>
                  <option value="ACTIVE">Activo</option>
                  <option value="ARCHIVED">Archivado</option>
                </Select>
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending} data-testid="submit-project">
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Browse = {
  current: { id: string; name: string; path: string; parentId: string | null; webUrl: string | null };
  folders: { id: string; name: string; childCount: number | null; linkedTo: { projectCode: string; company: string | null }[] }[];
  storage: "demo" | "sharepoint";
};

/** Selector de la carpeta del proyecto navegando la biblioteca REAL (solo lectura). */
export function LocationPicker({ projectId, companies, hasShared }: { projectId: string; companies: CompanyChoice[]; hasShared: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<Browse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<{ id: string; path: string } | null>(null);
  const [companyId, setCompanyId] = React.useState<string>("");
  const { pending, run } = useAction();

  async function load(itemId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Browse>(`/api/admin/sharepoint/browse${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ""}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !data) void load();
        if (!v) setSelected(null);
      }}
    >
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="open-location-picker">
        <Link2 aria-hidden /> Asociar carpeta de SharePoint
      </Button>
      <DialogContent size="lg">
        <DialogHeader title="Asociar ubicación de SharePoint" description="Navegue la biblioteca configurada y seleccione la carpeta que contiene las etapas del proyecto. No se modifica nada en SharePoint." />
        <DialogBody className="space-y-4">
          {data?.storage === "demo" ? <Alert tone="warning">Modo demostración: se muestra la biblioteca local de prueba.</Alert> : null}
          <Field label="Aplica a" htmlFor="loc-company" hint="Ubicación compartida para todos los contratistas del proyecto, o específica de una empresa (estructura «Empresa / Proyecto»).">
            <Select id="loc-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Todos los contratistas (ubicación compartida){hasShared ? " — reemplaza la actual" : ""}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  Solo {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-md border border-line">
            <div className="flex items-center gap-2 border-b border-line bg-subtle px-3 py-2">
              <Button size="icon-sm" variant="ghost" disabled={!data?.current.parentId || loading} onClick={() => load(data?.current.parentId)} aria-label="Subir un nivel">
                <CornerLeftUp />
              </Button>
              <span className="path-text min-w-0 flex-1 truncate text-ink-700">{data?.current.path ?? "…"}</span>
            </div>
            <div className="max-h-80 min-h-40 overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-7" />
                  <Skeleton className="h-7" />
                </div>
              ) : error ? (
                <div className="p-3">
                  <Alert tone="danger">{error}</Alert>
                </div>
              ) : data && data.folders.length === 0 ? (
                <EmptyState icon={<Folder />} title="Sin subcarpetas" className="py-6" />
              ) : (
                <ul className="divide-y divide-line">
                  {data?.folders.map((f) => (
                    <li key={f.id} className={`flex items-center gap-2 px-3 py-1.5 ${selected?.id === f.id ? "bg-action-50" : ""}`}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[0.8125rem]">
                        <input type="radio" name="loc" className="accent-brand-700" checked={selected?.id === f.id} onChange={() => setSelected({ id: f.id, path: `${data.current.path === "/" ? "" : data.current.path}/${f.name}` })} data-testid="location-option" />
                        <Folder className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate text-ink-900">{f.name}</span>
                        {f.linkedTo.map((l) => (
                          <Badge key={l.projectCode + l.company} tone="info">
                            {l.projectCode}
                          </Badge>
                        ))}
                      </label>
                      <Button size="icon-sm" variant="ghost" onClick={() => load(f.id)} aria-label={`Abrir ${f.name}`}>
                        <ChevronRight />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {selected ? (
            <div>
              <p className="text-2xs font-medium uppercase tracking-[0.05em] text-ink-500">Ubicación seleccionada</p>
              <p className="path-text mt-1 rounded-md border border-line bg-subtle px-3 py-2" data-testid="selected-location">
                {selected.path}
              </p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!selected}
            loading={pending}
            onClick={async () => {
              const ok = await run(() => api(`/api/admin/projects/${projectId}/locations`, { method: "PUT", json: { driveItemId: selected!.id, companyId: companyId || null } }), "Ubicación asociada y estructura verificada");
              if (ok) setOpen(false);
            }}
            data-testid="confirm-location"
          >
            Asociar ubicación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StageReport = {
  key: string;
  label: string;
  status: "found" | "missing" | "ambiguous";
  folder: { id: string; name: string; path: string } | null;
  candidates: { id: string; name: string }[];
  expectedSubfolders: { name: string; found: boolean; actualName: string | null }[];
  otherSubfolders: { id: string; name: string }[];
};

/** Verificación de estructura (lectura) y creación controlada de carpetas faltantes. */
export function StructurePanel({ locationId }: { locationId: string }) {
  const [report, setReport] = React.useState<{ stages: StageReport[]; rootPath: string; verifiedAt: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ stageKey: string; subfolderName: string | null; path: string } | null>(null);
  const [typed, setTyped] = React.useState("");
  const { pending, run } = useAction();

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      setReport(await api(`/api/admin/locations/${locationId}/verify`, { method: "POST" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function prepare(stageKey: string, subfolderName: string | null) {
    try {
      const qs = new URLSearchParams({ stageKey, ...(subfolderName ? { subfolderName } : {}) });
      const { path } = await api<{ path: string }>(`/api/admin/locations/${locationId}/structure?${qs}`);
      setTyped("");
      setConfirm({ stageKey, subfolderName, path });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={verify} loading={loading} data-testid="verify-structure">
          <RefreshCw aria-hidden /> Verificar estructura
        </Button>
        {report ? <span className="text-[0.75rem] text-ink-500">Verificada sobre {report.rootPath}</span> : <span className="text-[0.75rem] text-ink-500">Consulta de solo lectura en SharePoint.</span>}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {report ? (
        <div className="divide-y divide-line rounded-md border border-line" data-testid="structure-report">
          {report.stages.map((s) => (
            <div key={s.key} className="px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {s.status === "found" ? <CheckCircle2 className="size-4 text-success-700" aria-hidden /> : <AlertTriangle className="size-4 text-warning-700" aria-hidden />}
                <span className="text-[0.8125rem] font-semibold text-ink-900">{s.label}</span>
                {s.folder ? <span className="path-text text-ink-600">{s.folder.name}</span> : null}
                {s.status === "missing" ? (
                  <>
                    <Badge tone="warning">No existe</Badge>
                    <Button size="sm" variant="secondary" className="ml-auto" onClick={() => prepare(s.key, null)}>
                      <FolderPlus aria-hidden /> Crear carpeta de etapa
                    </Button>
                  </>
                ) : null}
                {s.status === "ambiguous" ? <Badge tone="warning">Varias coincidencias: {s.candidates.map((c) => c.name).join(", ")}</Badge> : null}
              </div>
              {s.folder && s.expectedSubfolders.length ? (
                <ul className="mt-2 grid gap-1 pl-6 sm:grid-cols-2">
                  {s.expectedSubfolders.map((e) => (
                    <li key={e.name} className="flex items-center gap-2 text-[0.8125rem]">
                      {e.found ? <CheckCircle2 className="size-3.5 text-success-700" aria-hidden /> : <AlertTriangle className="size-3.5 text-warning-700" aria-hidden />}
                      <span className={e.found ? "text-ink-800" : "text-warning-800"}>{e.actualName ?? e.name}</span>
                      {!e.found ? (
                        <button type="button" className="text-[0.75rem] font-medium text-action-600 hover:underline" onClick={() => prepare(s.key, e.name)}>
                          Crear
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.otherSubfolders.length ? <p className="mt-1.5 pl-6 text-[0.75rem] text-ink-500">Otras carpetas existentes: {s.otherSubfolders.map((o) => o.name).join(", ")}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Autorizar creación en SharePoint"
        description="Esta operación crea una carpeta real en la biblioteca. Revise la ruta exacta y escríbala para autorizar."
        confirmLabel="Crear carpeta"
        loading={pending}
        confirmDisabled={typed !== confirm?.path}
        onConfirm={async () => {
          if (!confirm) return;
          const r = await run(() => api<{ stages: StageReport[]; rootPath: string; verifiedAt: string }>(`/api/admin/locations/${locationId}/structure`, { method: "POST", json: { stageKey: confirm.stageKey, subfolderName: confirm.subfolderName, confirmPath: typed } }), "Carpeta creada");
          if (r) {
            setReport(r);
            setConfirm(null);
          }
        }}
      >
        <p className="path-text rounded-md border border-line bg-subtle px-3 py-2" data-testid="confirm-structure-path">
          {confirm?.path}
        </p>
        <Field label="Escriba la ruta exacta" htmlFor="confirm-path" className="mt-3">
          <Input id="confirm-path" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

export function RemoveLocationButton({ locationId, path }: { locationId: string; path: string }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Quitar asociación
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Quitar asociación de ubicación"
        description={`Se eliminará solo la asociación en el portal con ${path}. SharePoint no se modifica.`}
        tone="danger"
        confirmLabel="Quitar"
        loading={pending}
        onConfirm={async () => {
          if (await run(() => api(`/api/admin/locations/${locationId}`, { method: "DELETE" }), "Asociación eliminada")) setOpen(false);
        }}
      />
    </>
  );
}
