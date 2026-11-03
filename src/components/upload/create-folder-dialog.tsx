"use client";
import * as React from "react";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { DescriptionList } from "@/components/ui/panel";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { validateItemName, sameName } from "@/lib/validation/names";
import type { FolderView } from "./types";

export type CreatedFolder = { folder: { id: string; name: string }; path: string; relativePath: string };

/**
 * Ventana «Crear nueva carpeta». Muestra proyecto, etapa, carpeta principal y la ruta
 * de destino resultante. La validación final, los permisos y los duplicados se
 * comprueban en el servidor; aquí solo se ofrece ayuda inmediata.
 */
export function CreateFolderDialog({
  view,
  onCreated,
  triggerVariant = "secondary",
  locationId,
}: {
  view: FolderView;
  onCreated: (created: CreatedFolder) => void;
  triggerVariant?: "secondary" | "primary";
  locationId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const check = validateItemName(name, "folder");
  const duplicate = check.ok ? view.children.find((c) => sameName(c.name, check.value)) : undefined;
  const clientError = !touched ? null : !check.ok ? check.error : duplicate ? `Ya existe «${duplicate.name}» en esta carpeta.` : null;
  const targetPath = `${view.fullPath === "/" ? "" : view.fullPath}/${check.ok ? check.value : name.trim() || "…"}`;

  function reset(v: boolean) {
    setOpen(v);
    if (!v) {
      setName("");
      setTouched(false);
      setError(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok || duplicate) return;
    setPending(true);
    setError(null);
    try {
      const res = await api<CreatedFolder>(`/api/projects/${view.project.id}/folders`, {
        method: "POST",
        json: { parentItemId: view.folder.id, name: check.value, locationId: locationId ?? null },
      });
      toast.success("Carpeta creada", { description: res.path });
      reset(false);
      onCreated(res);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "NAME_ALREADY_EXISTS" ? "Otra persona creó una carpeta con ese nombre hace un momento. Elija otro nombre." : errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)} disabled={!view.capabilities.canCreateFolder} data-testid="open-create-folder" title={view.capabilities.canCreateFolder ? undefined : "No puede crear carpetas en esta ubicación"}>
        <FolderPlus aria-hidden /> CREAR NUEVA CARPETA
      </Button>
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="Crear nueva carpeta" description="La carpeta se creará directamente en la ubicación indicada." />
          <DialogBody className="space-y-4">
            {view.storage === "demo" ? <Alert tone="warning">Modo demostración: la carpeta se crea en el almacenamiento local de prueba, no en SharePoint.</Alert> : null}
            <Field label="Nombre de la nueva carpeta" htmlFor="folder-name" required error={clientError}>
              <Input
                id="folder-name"
                value={name}
                autoFocus
                maxLength={255}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onBlur={() => setTouched(true)}
                aria-invalid={Boolean(clientError)}
                data-testid="folder-name-input"
              />
            </Field>
            <DescriptionList
              items={[
                { label: "Proyecto", value: `${view.project.code} · ${view.project.name}` },
                { label: "Etapa", value: view.stage?.label ?? "—" },
                { label: "Carpeta principal", value: view.folder.isRoot ? view.project.name : view.folder.name },
              ]}
            />
            <div>
              <p className="text-2xs font-medium uppercase tracking-[0.05em] text-ink-500">Ruta de destino</p>
              <p className="path-text mt-1 rounded-md border border-line bg-subtle px-3 py-2 text-ink-900" data-testid="folder-target-path">
                {targetPath}
              </p>
            </div>
            {error ? <Alert tone="danger">{error}</Alert> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => reset(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()} data-testid="confirm-create-folder">
              Crear carpeta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
