"use client";
import * as React from "react";
import { CheckCircle2, Plus, Trash2, XCircle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { api, errorMessage } from "@/lib/client/api";
import type { Settings, StageDefinition } from "@/lib/validation/settings-schema";
import { useAction } from "./user-management";

function Section<S extends keyof Settings>({ section, title, description, initial, children }: { section: S; title: string; description: string; initial: Settings[S]; children: (v: Settings[S], set: (patch: Partial<Settings[S]>) => void) => React.ReactNode }) {
  const [value, setValue] = React.useState(initial);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  return (
    <Panel data-testid={`settings-${section}`}>
      <PanelHeader
        title={title}
        description={description}
        actions={
          <>
            {dirty ? (
              <Button size="sm" variant="ghost" onClick={() => setValue(initial)}>
                Descartar
              </Button>
            ) : null}
            <Button size="sm" variant="primary" disabled={!dirty} loading={pending} onClick={() => run(() => api(`/api/admin/settings/${section}`, { method: "PUT", json: value }), "Configuración guardada")}>
              Guardar
            </Button>
          </>
        }
      />
      <PanelBody className="space-y-4">{children(value, (patch) => setValue((v) => ({ ...v, ...patch })))}</PanelBody>
    </Panel>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="text-[0.8125rem]">
        <span className="font-medium text-ink-900">{label}</span>
        {hint ? <span className="block text-ink-500">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const num = (v: string) => (v === "" ? 0 : Number(v));

export function SettingsForms({ settings }: { settings: Settings }) {
  return (
    <div className="space-y-5">
      <Section section="branding" title="Identidad corporativa" description="Nombre y datos visibles del portal." initial={settings.branding}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre del portal" htmlFor="s-name">
              <Input id="s-name" value={v.portalName} onChange={(e) => set({ portalName: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Organización" htmlFor="s-org">
              <Input id="s-org" value={v.organizationName} onChange={(e) => set({ organizationName: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Subtítulo" htmlFor="s-sub" className="md:col-span-2">
              <Input id="s-sub" value={v.subtitle} onChange={(e) => set({ subtitle: e.target.value })} maxLength={140} />
            </Field>
            <Field label="Correo de soporte" htmlFor="s-support">
              <Input id="s-support" type="email" value={v.supportEmail} onChange={(e) => set({ supportEmail: e.target.value })} />
            </Field>
            <Field label="Color corporativo de referencia" htmlFor="s-color" hint="Se utiliza en documentos y comunicaciones del portal.">
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Selector de color" value={v.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="h-9 w-12 rounded-md border border-line-strong" />
                <Input id="s-color" value={v.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="w-32 font-mono" />
              </div>
            </Field>
          </div>
        )}
      </Section>

      <Section section="uploads" title="Parámetros de carga" description="Límites validados en el navegador y, de forma obligatoria, en el servidor." initial={settings.uploads}>
        {(v, set) => (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tamaño máximo por archivo (MB)" htmlFor="u-max">
                <Input id="u-max" type="number" min={1} value={v.maxFileSizeMB} onChange={(e) => set({ maxFileSizeMB: num(e.target.value) })} />
              </Field>
              <Field label="Archivos por operación" htmlFor="u-count">
                <Input id="u-count" type="number" min={1} max={200} value={v.maxFilesPerOperation} onChange={(e) => set({ maxFilesPerOperation: num(e.target.value) })} />
              </Field>
              <Field label="Fragmento (KiB, múltiplo de 320)" htmlFor="u-chunk">
                <Input id="u-chunk" type="number" step={320} min={320} value={v.chunkSizeKB} onChange={(e) => set({ chunkSizeKB: num(e.target.value) })} />
              </Field>
              <Field label="Reintentos por fragmento" htmlFor="u-retry">
                <Input id="u-retry" type="number" min={0} max={10} value={v.maxRetries} onChange={(e) => set({ maxRetries: num(e.target.value) })} />
              </Field>
              <Field label="Carga simple hasta (MB)" htmlFor="u-simple" hint="Por encima se usa sesión de carga de Graph.">
                <Input id="u-simple" type="number" min={0} max={4} step={0.5} value={v.simpleUploadMaxMB} onChange={(e) => set({ simpleUploadMaxMB: num(e.target.value) })} />
              </Field>
              <Field label="Cargas simultáneas" htmlFor="u-par">
                <Input id="u-par" type="number" min={1} max={6} value={v.parallelUploads} onChange={(e) => set({ parallelUploads: num(e.target.value) })} />
              </Field>
            </div>
            <Field label="Extensiones permitidas" htmlFor="u-ext" hint="Separadas por comas, sin punto.">
              <Textarea id="u-ext" rows={2} value={v.allowedExtensions.join(", ")} onChange={(e) => set({ allowedExtensions: e.target.value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^\./, "")).filter(Boolean) })} />
            </Field>
            <Toggle label="Permitir a contratistas reemplazar documentos existentes" hint="Si está desactivado, solo el administrador puede reemplazar; el contratista debe renombrar o cancelar." checked={v.allowContractorReplace} onChange={(c) => set({ allowContractorReplace: c })} />
          </div>
        )}
      </Section>

      <Section section="structure" title="Estructura documental" description="Etapas y subcarpetas iniciales esperadas. Se verifican en SharePoint; nunca se crean automáticamente." initial={settings.structure}>
        {(v, set) => (
          <div className="space-y-4">
            {v.stages.map((st, idx) => (
              <StageEditor
                key={idx}
                stage={st}
                onChange={(s) => set({ stages: v.stages.map((x, i) => (i === idx ? s : x)) })}
                onRemove={v.stages.length > 1 ? () => set({ stages: v.stages.filter((_, i) => i !== idx) }) : undefined}
              />
            ))}
            <Button size="sm" variant="secondary" onClick={() => set({ stages: [...v.stages, { key: `etapa${v.stages.length + 1}`, label: "Nueva etapa", order: v.stages.length + 1, folderNames: [`${v.stages.length + 1}. Nueva etapa`], expectedSubfolders: [] }] })}>
              <Plus aria-hidden /> Agregar etapa
            </Button>
            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle label="Contratistas pueden crear carpetas en la raíz de cada etapa" checked={v.contractorsCanCreateAtStageRoot} onChange={(c) => set({ contractorsCanCreateAtStageRoot: c })} />
              <Field label="Profundidad máxima de carpetas" htmlFor="st-depth">
                <Input id="st-depth" type="number" min={1} max={30} value={v.maxFolderDepth} onChange={(e) => set({ maxFolderDepth: num(e.target.value) })} />
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section section="auth" title="Acceso y sesiones" description="Política de sesiones y vinculación de identidades." initial={settings.auth}>
        {(v, set) => (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cierre por inactividad (minutos)" htmlFor="a-idle">
                <Input id="a-idle" type="number" min={5} value={v.sessionIdleMinutes} onChange={(e) => set({ sessionIdleMinutes: num(e.target.value) })} />
              </Field>
              <Field label="Duración máxima de sesión (horas)" htmlFor="a-abs">
                <Input id="a-abs" type="number" min={1} value={v.sessionAbsoluteHours} onChange={(e) => set({ sessionAbsoluteHours: num(e.target.value) })} />
              </Field>
            </div>
            <Toggle
              label="Vincular identidad por correo en el primer inicio de sesión"
              hint="Solo para registros autorizados sin identidad asociada. Luego se exige siempre el mismo identificador (oid/tid)."
              checked={v.allowFirstLoginEmailBinding}
              onChange={(c) => set({ allowFirstLoginEmailBinding: c })}
            />
            <Toggle label="Microsoft envía el correo de invitación B2B" checked={v.sendInvitationEmail} onChange={(c) => set({ sendInvitationEmail: c })} />
            <Field label="Mensaje de la invitación" htmlFor="a-msg">
              <Textarea id="a-msg" rows={3} value={v.invitationMessage} onChange={(e) => set({ invitationMessage: e.target.value })} maxLength={1000} />
            </Field>
          </div>
        )}
      </Section>

      <Section section="audit" title="Parámetros de auditoría" description="El registro es inmutable. La retención se aplica con el script de mantenimiento." initial={settings.audit}>
        {(v, set) => (
          <div className="space-y-4">
            <Toggle label="Registrar dirección IP de origen" checked={v.captureIp} onChange={(c) => set({ captureIp: c })} />
            <Toggle label="Registrar agente de usuario (navegador)" checked={v.captureUserAgent} onChange={(c) => set({ captureUserAgent: c })} />
            <Field label="Retención (días)" htmlFor="au-ret" className="max-w-xs">
              <Input id="au-ret" type="number" min={30} value={v.retentionDays} onChange={(e) => set({ retentionDays: num(e.target.value) })} />
            </Field>
          </div>
        )}
      </Section>
    </div>
  );
}

function StageEditor({ stage, onChange, onRemove }: { stage: StageDefinition; onChange: (s: StageDefinition) => void; onRemove?: () => void }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Orden" htmlFor={`st-o-${stage.key}`} className="sm:col-span-1">
          <Input id={`st-o-${stage.key}`} type="number" min={1} value={stage.order} onChange={(e) => onChange({ ...stage, order: num(e.target.value) })} />
        </Field>
        <Field label="Etiqueta" htmlFor={`st-l-${stage.key}`} className="sm:col-span-2">
          <Input id={`st-l-${stage.key}`} value={stage.label} onChange={(e) => onChange({ ...stage, label: e.target.value })} />
        </Field>
        <Field label="Clave" htmlFor={`st-k-${stage.key}`} className="sm:col-span-2">
          <Input id={`st-k-${stage.key}`} value={stage.key} onChange={(e) => onChange({ ...stage, key: e.target.value.toLowerCase() })} className="font-mono" />
        </Field>
        <div className="flex items-end sm:col-span-1">
          {onRemove ? (
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Eliminar etapa">
              <Trash2 />
            </Button>
          ) : null}
        </div>
        <Field label="Nombres de carpeta aceptados en SharePoint" htmlFor={`st-f-${stage.key}`} hint="Uno por línea, p. ej. «2. Ejecución»." className="sm:col-span-3">
          <Textarea id={`st-f-${stage.key}`} rows={3} value={stage.folderNames.join("\n")} onChange={(e) => onChange({ ...stage, folderNames: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
        </Field>
        <Field label="Subcarpetas iniciales esperadas" htmlFor={`st-e-${stage.key}`} hint="Una por línea." className="sm:col-span-3">
          <Textarea id={`st-e-${stage.key}`} rows={3} value={stage.expectedSubfolders.join("\n")} onChange={(e) => onChange({ ...stage, expectedSubfolders: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      </div>
    </div>
  );
}

type Check = { key: string; label: string; ok: boolean; detail: string };

export function MicrosoftStatus({ checks, demo }: { checks: Check[]; demo: boolean }) {
  const [steps, setSteps] = React.useState<{ label: string; ok: boolean; detail: string }[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Panel>
      <PanelHeader
        title="Conexión con Microsoft 365"
        description="Estado de la configuración del servidor (los secretos nunca se muestran)."
        actions={
          !demo ? (
            <Button
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  setSteps((await api<{ steps: { label: string; ok: boolean; detail: string }[] }>("/api/admin/sharepoint/diagnostics")).steps);
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Activity aria-hidden /> Probar conexión
            </Button>
          ) : null
        }
      />
      <PanelBody className="space-y-3">
        {demo ? <Alert tone="warning">Modo demostración: la aplicación no se conecta con Microsoft 365. Configure APP_MODE=production y las variables siguientes para la integración real.</Alert> : null}
        <ul className="divide-y divide-line rounded-md border border-line">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5 px-3 py-2 text-[0.8125rem]">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-700" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-700" aria-hidden />}
              <span>
                <span className="font-medium text-ink-900">{c.label}</span>
                <span className="block text-ink-500">{c.ok ? "Configurado" : c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {steps ? (
          <ul className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[0.8125rem]">
                {s.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-700" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-700" aria-hidden />}
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="path-text block text-ink-600">{s.detail}</span>
                </span>
              </li>
            ))}
            {steps.length === 0 ? <li className="text-[0.8125rem] text-ink-500">Defina SHAREPOINT_HOSTNAME, SHAREPOINT_SITE_PATH, SHAREPOINT_SITE_ID o SHAREPOINT_DRIVE_ID para ejecutar pruebas.</li> : null}
          </ul>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
