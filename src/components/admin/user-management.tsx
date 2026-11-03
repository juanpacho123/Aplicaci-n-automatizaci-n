"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, MailPlus, Pencil, RotateCcw, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/client/api";

export type ProjectChoice = { id: string; code: string; name: string; status: string };
export type CompanyChoice = { id: string; name: string };

export function useAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string | null)): Promise<T | null> => {
      setPending(true);
      try {
        const r = await fn();
        const msg = typeof success === "function" ? success(r) : success;
        if (msg) toast.success(msg);
        router.refresh();
        return r;
      } catch (err) {
        toast.error(errorMessage(err));
        return null;
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { pending, run };
}

export function ProjectChecklist({ projects, selected, onChange, idPrefix = "p" }: { projects: ProjectChoice[]; selected: string[]; onChange: (ids: string[]) => void; idPrefix?: string }) {
  const [q, setQ] = React.useState("");
  const visible = projects.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded-md border border-line">
      <div className="border-b border-line p-2">
        <Input placeholder="Buscar proyecto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proyecto" />
      </div>
      <ul className="max-h-56 divide-y divide-line overflow-y-auto">
        {visible.map((p) => (
          <li key={p.id}>
            <label htmlFor={`${idPrefix}-${p.id}`} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[0.8125rem] hover:bg-subtle">
              <Checkbox
                id={`${idPrefix}-${p.id}`}
                checked={selected.includes(p.id)}
                onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((s) => s !== p.id))}
                data-testid={`project-check-${p.code}`}
              />
              <span className="font-medium text-ink-900">{p.code}</span>
              <span className="truncate text-ink-600">{p.name}</span>
              {p.status !== "ACTIVE" ? <span className="ml-auto text-2xs text-ink-400">Archivado</span> : null}
            </label>
          </li>
        ))}
        {visible.length === 0 ? <li className="px-3 py-3 text-[0.8125rem] text-ink-500">Sin resultados.</li> : null}
      </ul>
      <div className="border-t border-line bg-subtle px-3 py-1.5 text-[0.75rem] text-ink-500" data-numeric>
        {selected.length} seleccionados
      </div>
    </div>
  );
}

/** Registro de contratista: correo, datos, empresa, rol, proyectos e invitación. */
export function CreateUserDialog({ projects, companies, demo }: { projects: ProjectChoice[]; companies: CompanyChoice[]; demo: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [projectIds, setProjectIds] = React.useState<string[]>([]);
  const [companyMode, setCompanyMode] = React.useState<"existing" | "new" | "none">(companies.length ? "existing" : "new");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ status: string; message: string; ok: boolean } | null>(null);
  const { pending, run } = useAction();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      fullName: String(fd.get("fullName") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? "") || undefined,
      companyId: companyMode === "existing" ? String(fd.get("companyId") ?? "") || null : null,
      newCompanyName: companyMode === "new" ? String(fd.get("newCompanyName") ?? "") || null : null,
      roleKey: String(fd.get("roleKey")),
      identityType: String(fd.get("identityType")),
      projectIds,
      authorizeNow: fd.get("authorizeNow") === "on",
    };
    try {
      const res = await api<{ user: { id: string; status: string }; authorization: { status: string; invitation: { ok: boolean; message: string } } | null }>("/api/admin/users", { method: "POST", json: payload });
      setResult(res.authorization ? { status: res.authorization.status, message: res.authorization.invitation.message, ok: res.authorization.invitation.ok } : { status: res.user.status, message: "Registro guardado como pendiente de aprobación.", ok: true });
      await run(async () => null, "Contratista registrado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    }
  }

  function close(v: boolean) {
    setOpen(v);
    if (!v) {
      setProjectIds([]);
      setError(null);
      setResult(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <Button variant="primary" onClick={() => setOpen(true)} data-testid="open-create-user">
        <UserPlus aria-hidden /> Registrar contratista
      </Button>
      <DialogContent size="lg">
        {result ? (
          <>
            <DialogHeader title="Contratista registrado" />
            <DialogBody className="space-y-3">
              <Alert tone={result.ok ? "success" : "warning"} title={result.status === "INVITATION_SENT" ? "Invitación enviada" : result.status === "ACTIVE" ? "Acceso autorizado" : "Pendiente de autorización"}>
                {result.message}
              </Alert>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => close(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader title="Registrar contratista" description="El correo identifica el registro; el acceso se concede solo tras verificar la identidad con Microsoft." />
            <DialogBody className="space-y-4">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre completo" htmlFor="u-name" required>
                  <Input id="u-name" name="fullName" required maxLength={120} data-testid="user-fullname" />
                </Field>
                <Field label="Correo electrónico" htmlFor="u-email" required>
                  <Input id="u-email" name="email" type="email" required maxLength={254} data-testid="user-email" />
                </Field>
                <Field label="Teléfono" htmlFor="u-phone">
                  <Input id="u-phone" name="phone" maxLength={40} />
                </Field>
                <Field label="Rol" htmlFor="u-role" required>
                  <Select id="u-role" name="roleKey" defaultValue="CONTRACTOR">
                    <option value="CONTRACTOR">Contratista</option>
                    <option value="VIEWER">Consulta</option>
                    <option value="ADMIN">Administrador</option>
                  </Select>
                </Field>
              </div>
              <Field label="Empresa" htmlFor="u-company">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select aria-label="Tipo de empresa" value={companyMode} onChange={(e) => setCompanyMode(e.target.value as typeof companyMode)} className="sm:w-44">
                    {companies.length ? <option value="existing">Existente</option> : null}
                    <option value="new">Nueva empresa</option>
                    <option value="none">Sin empresa</option>
                  </Select>
                  {companyMode === "existing" ? (
                    <div className="flex-1">
                      <Select id="u-company" name="companyId" required>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : companyMode === "new" ? (
                    <Input id="u-company" name="newCompanyName" placeholder="Nombre de la empresa" required maxLength={120} className="flex-1" data-testid="user-new-company" />
                  ) : null}
                </div>
              </Field>
              <Field label="Tipo de identidad" htmlFor="u-identity" hint="Los contratistas externos reciben una invitación B2B de Microsoft para verificar su identidad.">
                <Select id="u-identity" name="identityType" defaultValue="GUEST">
                  <option value="GUEST">Invitado externo (Microsoft Entra B2B)</option>
                  <option value="MEMBER">Cuenta de la organización</option>
                </Select>
              </Field>
              <div>
                <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">Proyectos autorizados</p>
                <ProjectChecklist projects={projects} selected={projectIds} onChange={setProjectIds} idPrefix="new" />
              </div>
              <label className="flex items-start gap-2.5 rounded-md border border-line bg-subtle p-3 text-[0.8125rem]">
                <Checkbox name="authorizeNow" defaultChecked className="mt-0.5" />
                <span>
                  <span className="font-medium text-ink-900">Autorizar y enviar invitación ahora</span>
                  <span className="block text-ink-600">
                    {demo ? "Modo demostración: no se envían invitaciones; la cuenta quedará activa para el acceso de demostración." : "Se enviará la invitación real de Microsoft Entra B2B con su identidad de administrador."}
                  </span>
                </span>
              </label>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending} data-testid="submit-create-user">
                Registrar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type UserForActions = { id: string; status: string; roleKey: string; identityType: string; fullName: string; phone: string | null; companyId: string | null; isSelf: boolean };

/** Acciones de estado del usuario con motivo obligatorio cuando corresponde. */
export function UserStatusActions({ user, demo }: { user: UserForActions; demo: boolean }) {
  const { pending, run } = useAction();
  const [dialog, setDialog] = React.useState<null | "suspend" | "reactivate" | "reject">(null);
  const [reason, setReason] = React.useState("");

  const labels = { suspend: "Suspender acceso", reactivate: "Reactivar acceso", reject: "Rechazar registro" } as const;
  const descriptions = {
    suspend: "El usuario no podrá iniciar sesión ni operar. Sus sesiones se invalidarán de inmediato. Sus documentos e historial se conservan.",
    reactivate: "El usuario podrá volver a iniciar sesión y operar sobre sus proyectos asignados.",
    reject: "El registro quedará rechazado y no podrá acceder.",
  } as const;

  async function confirm() {
    if (!dialog) return;
    const ok = await run(() => api(`/api/admin/users/${user.id}/${dialog}`, { method: "POST", json: { reason } }), dialog === "suspend" ? "Acceso suspendido" : dialog === "reactivate" ? "Acceso reactivado" : "Registro rechazado");
    if (ok) {
      setDialog(null);
      setReason("");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {["PENDING_APPROVAL"].includes(user.status) ? (
        <Button variant="primary" size="sm" loading={pending} onClick={() => run(() => api<{ invitation: { message: string } }>(`/api/admin/users/${user.id}/authorize`, { method: "POST" }), (r) => r.invitation.message)} data-testid="authorize-user">
          <ShieldCheck aria-hidden /> Autorizar {user.identityType === "GUEST" && !demo ? "y enviar invitación" : ""}
        </Button>
      ) : null}
      {user.identityType === "GUEST" && ["INVITATION_SENT"].includes(user.status) && !demo ? (
        <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => api<{ message: string }>(`/api/admin/users/${user.id}/invite`, { method: "POST" }), (r) => r.message)}>
          <MailPlus aria-hidden /> Reenviar invitación
        </Button>
      ) : null}
      {["ACTIVE", "INVITATION_SENT", "PENDING_APPROVAL"].includes(user.status) && !user.isSelf ? (
        <Button variant="danger-outline" size="sm" onClick={() => setDialog("suspend")} data-testid="suspend-user">
          <Ban aria-hidden /> Suspender
        </Button>
      ) : null}
      {user.status === "SUSPENDED" ? (
        <Button variant="secondary" size="sm" onClick={() => setDialog("reactivate")} data-testid="reactivate-user">
          <RotateCcw aria-hidden /> Reactivar
        </Button>
      ) : null}
      {["PENDING_APPROVAL", "INVITATION_SENT"].includes(user.status) ? (
        <Button variant="ghost" size="sm" onClick={() => setDialog("reject")}>
          <XCircle aria-hidden /> Rechazar
        </Button>
      ) : null}
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog ? labels[dialog] : ""}
        description={dialog ? descriptions[dialog] : undefined}
        tone={dialog === "suspend" || dialog === "reject" ? "danger" : "primary"}
        confirmLabel={dialog ? labels[dialog] : "Confirmar"}
        loading={pending}
        confirmDisabled={reason.trim().length < 3}
        onConfirm={confirm}
      >
        <Field label="Motivo (queda registrado en la auditoría)" htmlFor="status-reason" required>
          <Textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} data-testid="status-reason" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

export function EditUserDialog({ user, companies }: { user: UserForActions; companies: CompanyChoice[] }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run(
      () => api(`/api/admin/users/${user.id}`, { method: "PATCH", json: { fullName: fd.get("fullName"), phone: String(fd.get("phone") ?? "") || undefined, companyId: String(fd.get("companyId") ?? "") || null } }),
      "Datos actualizados",
    );
    if (ok) setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil aria-hidden /> Editar datos
      </Button>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="Editar datos del usuario" description="El correo electrónico no se modifica: identifica el registro autorizado." />
          <DialogBody className="space-y-4">
            <Field label="Nombre completo" htmlFor="e-name" required>
              <Input id="e-name" name="fullName" defaultValue={user.fullName} required maxLength={120} />
            </Field>
            <Field label="Teléfono" htmlFor="e-phone">
              <Input id="e-phone" name="phone" defaultValue={user.phone ?? ""} maxLength={40} />
            </Field>
            <Field label="Empresa" htmlFor="e-company">
              <Select id="e-company" name="companyId" defaultValue={user.companyId ?? ""}>
                <option value="">Sin empresa</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoleSelector({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const [value, setValue] = React.useState(role);
  const [confirm, setConfirm] = React.useState(false);
  const { pending, run } = useAction();
  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Rol" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} className="w-44" data-testid="role-select">
        <option value="CONTRACTOR">Contratista</option>
        <option value="VIEWER">Consulta</option>
        <option value="ADMIN">Administrador</option>
      </Select>
      <Button size="sm" variant="secondary" disabled={value === role || disabled} onClick={() => setConfirm(true)}>
        Cambiar rol
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cambiar rol"
        description="El cambio de privilegios cierra las sesiones activas del usuario."
        loading={pending}
        onConfirm={async () => {
          if (await run(() => api(`/api/admin/users/${userId}/role`, { method: "PUT", json: { roleKey: value } }), "Rol actualizado")) setConfirm(false);
        }}
      />
    </div>
  );
}

export function ProjectAssignment({ userId, projects, assigned }: { userId: string; projects: ProjectChoice[]; assigned: string[] }) {
  const [selected, setSelected] = React.useState(assigned);
  const { pending, run } = useAction();
  const changed = selected.length !== assigned.length || selected.some((s) => !assigned.includes(s));
  return (
    <div className="space-y-3">
      <ProjectChecklist projects={projects} selected={selected} onChange={setSelected} idPrefix={`a-${userId}`} />
      <div className="flex justify-end gap-2">
        {changed ? (
          <Button variant="ghost" size="sm" onClick={() => setSelected(assigned)}>
            Descartar
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          disabled={!changed}
          loading={pending}
          onClick={() => run(() => api<{ added: number; removed: number }>(`/api/admin/users/${userId}/projects`, { method: "PUT", json: { projectIds: selected } }), (r) => `Proyectos actualizados (+${r.added} / −${r.removed})`)}
          data-testid="save-projects"
        >
          <CheckCircle2 aria-hidden /> Guardar asignación
        </Button>
      </div>
    </div>
  );
}

export function CompanyDialog({ company }: { company?: { id: string; name: string; taxId: string | null; contactEmail: string | null; notes: string | null } }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: fd.get("name"), taxId: fd.get("taxId"), contactEmail: fd.get("contactEmail"), notes: fd.get("notes") };
    const ok = await run(() => api(company ? `/api/admin/companies/${company.id}` : "/api/admin/companies", { method: company ? "PATCH" : "POST", json: body }), company ? "Empresa actualizada" : "Empresa registrada");
    if (ok) setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={company ? "ghost" : "primary"} size="sm" onClick={() => setOpen(true)}>
        {company ? <Pencil aria-hidden /> : <UserPlus aria-hidden />} {company ? "Editar" : "Registrar empresa"}
      </Button>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title={company ? "Editar empresa" : "Registrar empresa"} />
          <DialogBody className="space-y-4">
            <Field label="Nombre" htmlFor="c-name" required>
              <Input id="c-name" name="name" defaultValue={company?.name} required maxLength={120} />
            </Field>
            <Field label="Identificación tributaria" htmlFor="c-tax">
              <Input id="c-tax" name="taxId" defaultValue={company?.taxId ?? ""} maxLength={40} />
            </Field>
            <Field label="Correo de contacto" htmlFor="c-mail">
              <Input id="c-mail" name="contactEmail" type="email" defaultValue={company?.contactEmail ?? ""} maxLength={254} />
            </Field>
            <Field label="Notas" htmlFor="c-notes">
              <Textarea id="c-notes" name="notes" defaultValue={company?.notes ?? ""} maxLength={1000} rows={3} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
