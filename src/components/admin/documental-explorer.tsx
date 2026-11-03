"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field, Select } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/feedback";
import { FolderBrowser } from "@/components/shared/folder-browser";
import { FolderTree } from "lucide-react";

type Loc = { id: string; label: string };
type P = { id: string; code: string; name: string; locations: Loc[] };

/** Gestión documental del administrador: cualquier proyecto y cualquiera de sus ubicaciones. */
export function DocumentalExplorer({ projects }: { projects: P[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const projectId = sp.get("proyecto") ?? "";
  const project = projects.find((p) => p.id === projectId);
  const locationId = sp.get("ubicacion") ?? project?.locations[0]?.id ?? "";

  function go(params: Record<string, string>) {
    const qs = new URLSearchParams(params);
    router.replace(`/admin/documental?${qs}`);
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proyecto" htmlFor="doc-project">
            <Select id="doc-project" value={projectId} onChange={(e) => go(e.target.value ? { proyecto: e.target.value } : {})} data-testid="admin-project-select">
              <option value="">Seleccione un proyecto…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {project && project.locations.length > 1 ? (
            <Field label="Ubicación" htmlFor="doc-location">
              <Select id="doc-location" value={locationId} onChange={(e) => go({ proyecto: projectId, ubicacion: e.target.value })}>
                {project.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </Panel>
      <Panel>
        {!project ? (
          <EmptyState icon={<FolderTree />} title="Seleccione un proyecto" description="Consulte el árbol de carpetas, quién creó cada carpeta y gestione carpetas adicionales." />
        ) : project.locations.length === 0 ? (
          <EmptyState icon={<FolderTree />} title="Proyecto sin ubicación" description="Asocie la carpeta de SharePoint desde Proyectos." />
        ) : (
          <FolderBrowser key={`${projectId}:${locationId}`} projectId={projectId} locationId={locationId} manage />
        )}
      </Panel>
    </div>
  );
}
