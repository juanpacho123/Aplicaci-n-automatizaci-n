"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Folder, Lock, MoreHorizontal, Pencil, RefreshCw, Trash2, Upload, File as FileIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Table, TableContainer, TD, TH, THead, TR } from "@/components/ui/table";
import { CreateFolderDialog } from "@/components/upload/create-folder-dialog";
import type { FolderEntry, FolderView } from "@/components/upload/types";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, validateItemName } from "@/lib/validation/names";
import { formatDateTime } from "./format";

export function FolderBrowser({
  projectId,
  initialItemId,
  locationId,
  manage,
  uploadHref = "/cargar",
}: {
  projectId: string;
  initialItemId?: string | null;
  locationId?: string | null;
  manage?: boolean;
  uploadHref?: string;
}) {
  const [view, setView] = React.useState<FolderView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rename, setRename] = React.useState<FolderEntry | null>(null);
  const [remove, setRemove] = React.useState<FolderEntry | null>(null);
  const [value, setValue] = React.useState("");
  const [working, setWorking] = React.useState(false);

  const fetchView = React.useCallback(
    (itemId?: string | null) => {
      const qs = new URLSearchParams();
      if (itemId) qs.set("itemId", itemId);
      if (locationId) qs.set("locationId", locationId);
      return api<FolderView>(`/api/projects/${projectId}/folders?${qs}`);
    },
    [projectId, locationId],
  );

  const load = React.useCallback(
    async (itemId?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        setView(await fetchView(itemId));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [fetchView],
  );

  React.useEffect(() => {
    let cancelled = false;
    fetchView(initialItemId)
      .then((v) => !cancelled && setView(v))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchView, initialItemId]);

  async function doRename() {
    if (!rename || !view) return;
    setWorking(true);
    try {
      await api(`/api/projects/${projectId}/folders/${encodeURIComponent(rename.id)}`, { method: "PATCH", json: { newName: value, locationId: locationId ?? null } });
      toast.success("Carpeta renombrada");
      setRename(null);
      await load(view.folder.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function doDelete() {
    if (!remove || !view) return;
    setWorking(true);
    try {
      await api(`/api/projects/${projectId}/folders/${encodeURIComponent(remove.id)}`, { method: "DELETE", json: { confirmName: value, locationId: locationId ?? null } });
      toast.success("Carpeta eliminada", { description: view.storage === "sharepoint" ? "Se envió a la papelera de reciclaje del sitio." : undefined });
      setRemove(null);
      await load(view.folder.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  const renameCheck = validateItemName(value, "folder");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[0.8125rem]" aria-label="Ruta de la carpeta">
          {view?.breadcrumbs.map((c, i) => (
            <React.Fragment key={c.id}>
              {i > 0 ? <ChevronRight className="size-3.5 text-ink-400" aria-hidden /> : null}
              {i === view.breadcrumbs.length - 1 ? (
                <span className="font-medium text-ink-900">{c.name}</span>
              ) : (
                <button type="button" onClick={() => load(c.id)} className="text-action-600 hover:underline">
                  {c.name}
                </button>
              )}
            </React.Fragment>
          )) ?? <Skeleton className="h-5 w-48" />}
        </nav>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" onClick={() => load(view?.folder.id)} aria-label="Actualizar" disabled={loading}>
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
          {view?.capabilities.canUpload ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`${uploadHref}?proyecto=${projectId}&carpeta=${encodeURIComponent(view.folder.id)}${locationId ? `&ubicacion=${locationId}` : ""}`}>
                <Upload aria-hidden /> Cargar aquí
              </Link>
            </Button>
          ) : null}
          {view ? <CreateFolderDialog view={view} locationId={locationId} onCreated={(c) => load(c.folder.id)} /> : null}
        </div>
      </div>
      {view ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-subtle px-4 py-1.5">
          <span className="path-text text-ink-600" data-testid="browser-path">{view.fullPath}</span>
          {view.stage ? <Badge tone="brand">{view.stage.label}</Badge> : null}
          {view.folder.isProtected ? (
            <span className="inline-flex items-center gap-1 text-2xs text-ink-500">
              <Lock className="size-3" aria-hidden /> Estructura principal
            </span>
          ) : null}
          {view.folder.webUrl ? (
            <a href={view.folder.webUrl} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-[0.75rem] text-action-600 hover:underline">
              Abrir en SharePoint <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="p-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : loading && !view ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : view && view.children.length === 0 ? (
        <EmptyState icon={<Folder />} title="Carpeta vacía" description="No hay documentos ni subcarpetas en esta ubicación." />
      ) : view ? (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Nombre</TH>
                <TH className="hidden md:table-cell">Modificado</TH>
                <TH className="hidden lg:table-cell">Creado por</TH>
                <TH className="hidden sm:table-cell text-right">Tamaño</TH>
                <TH className="w-10">
                  <span className="sr-only">Acciones</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {view.children.map((c) => (
                <TR key={c.id} data-testid="browser-row">
                  <TD className="max-w-0 w-full">
                    {c.isFolder ? (
                      <button type="button" onClick={() => load(c.id)} className="flex min-w-0 items-center gap-2.5 text-left hover:text-action-700">
                        <Folder className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate font-medium text-ink-900">{c.name}</span>
                        {c.isProtected ? <Lock className="size-3 shrink-0 text-ink-400" aria-label="Estructura principal" /> : null}
                        {c.createdInPortal ? <Badge tone="info" className="hidden sm:inline-flex">Portal</Badge> : null}
                      </button>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2.5">
                        <FileIcon className="size-4 shrink-0 text-ink-500" aria-hidden />
                        {c.webUrl ? (
                          <a href={c.webUrl} target="_blank" rel="noreferrer noopener" className="truncate text-ink-900 hover:text-action-700 hover:underline">
                            {c.name}
                          </a>
                        ) : (
                          <span className="truncate text-ink-900">{c.name}</span>
                        )}
                      </span>
                    )}
                  </TD>
                  <TD className="hidden whitespace-nowrap text-ink-600 md:table-cell">{formatDateTime(c.modifiedAt)}</TD>
                  <TD className="hidden whitespace-nowrap text-ink-600 lg:table-cell">
                    {c.createdInPortal ? `${c.createdInPortal.by} (portal)` : c.createdBy ?? "—"}
                  </TD>
                  <TD className="hidden whitespace-nowrap text-right text-ink-600 sm:table-cell" data-numeric>
                    {c.isFolder ? (c.childCount !== null ? `${c.childCount} elem.` : "—") : formatBytes(c.size)}
                  </TD>
                  <TD>
                    {manage && c.isFolder && !c.isProtected ? (
                      <Menu>
                        <MenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={`Acciones para ${c.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            onSelect={() => {
                              setValue(c.name);
                              setRename(c);
                            }}
                          >
                            <Pencil aria-hidden /> Renombrar
                          </MenuItem>
                          <MenuItem
                            tone="danger"
                            onSelect={() => {
                              setValue("");
                              setRemove(c);
                            }}
                          >
                            <Trash2 aria-hidden /> Eliminar
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      ) : null}

      <ConfirmDialog
        open={Boolean(rename)}
        onOpenChange={(v) => !v && setRename(null)}
        title="Renombrar carpeta"
        description={rename ? `Carpeta actual: ${rename.name}` : undefined}
        confirmLabel="Renombrar"
        loading={working}
        confirmDisabled={!renameCheck.ok || value === rename?.name}
        onConfirm={doRename}
      >
        <Field label="Nuevo nombre" htmlFor="rename-input" error={value && !renameCheck.ok ? renameCheck.error : null}>
          <Input id="rename-input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={255} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Eliminar carpeta"
        tone="danger"
        confirmLabel="Eliminar carpeta"
        loading={working}
        confirmDisabled={value !== remove?.name}
        onConfirm={doDelete}
        description={
          remove ? (
            <>
              Se eliminará «{remove.name}»{remove.childCount ? ` y sus ${remove.childCount} elementos` : ""}.{" "}
              {view?.storage === "sharepoint" ? "En SharePoint el contenido se envía a la papelera de reciclaje del sitio." : ""}
            </>
          ) : undefined
        }
      >
        <Field label={`Para confirmar, escriba el nombre exacto: ${remove?.name ?? ""}`} htmlFor="delete-confirm">
          <Input id="delete-confirm" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
