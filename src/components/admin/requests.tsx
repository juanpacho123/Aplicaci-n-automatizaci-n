"use client";
import * as React from "react";
import { CheckCircle2, MessageSquare, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { ProjectChecklist, useAction, type CompanyChoice, type ProjectChoice } from "./user-management";

type Req = { id: string; fullName: string; companyName: string; email: string; requestedProject: string };

export function RequestActions({ request, projects, companies, demo, disabled }: { request: Req; projects: ProjectChoice[]; companies: CompanyChoice[]; demo: boolean; disabled?: boolean }) {
  const [approve, setApprove] = React.useState(false);
  const [dialog, setDialog] = React.useState<null | "reject" | "info">(null);
  const [text, setText] = React.useState("");
  const [projectIds, setProjectIds] = React.useState<string[]>([]);
  const match = companies.find((c) => c.name.toLowerCase() === request.companyName.toLowerCase());
  const [companyMode, setCompanyMode] = React.useState<"existing" | "new">(match ? "existing" : "new");
  const { pending, run } = useAction();

  async function submitApprove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run(
      () =>
        api<{ authorization: { invitation: { message: string } } | null }>(`/api/admin/access-requests/${request.id}/approve`, {
          method: "POST",
          json: {
            fullName: fd.get("fullName"),
            companyId: companyMode === "existing" ? fd.get("companyId") : null,
            newCompanyName: companyMode === "new" ? fd.get("newCompanyName") : null,
            roleKey: fd.get("roleKey"),
            identityType: fd.get("identityType"),
            projectIds,
            notes: fd.get("notes") || undefined,
          },
        }),
      (r) => r.authorization?.invitation.message ?? "Solicitud aprobada",
    );
    if (ok) setApprove(false);
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" variant="primary" onClick={() => setApprove(true)} disabled={disabled} data-testid="approve-request">
        <CheckCircle2 aria-hidden /> Aprobar
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setDialog("info")} disabled={disabled}>
        <MessageSquare aria-hidden /> Pedir información
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDialog("reject")} disabled={disabled}>
        <XCircle aria-hidden /> Rechazar
      </Button>

      <Dialog open={approve} onOpenChange={setApprove}>
        <DialogContent size="lg">
          <form onSubmit={submitApprove} className="flex min-h-0 flex-col">
            <DialogHeader title="Aprobar solicitud de acceso" description={`${request.email} · solicitó: ${request.requestedProject}`} />
            <DialogBody className="space-y-4">
              <Alert tone="info">La aprobación registra al usuario con los proyectos que usted asigne explícitamente. {demo ? "Modo demostración: no se envían invitaciones." : "Se enviará la invitación de Microsoft Entra B2B."}</Alert>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre completo" htmlFor="a-name" required>
                  <Input id="a-name" name="fullName" defaultValue={request.fullName} required maxLength={120} />
                </Field>
                <Field label="Rol" htmlFor="a-role">
                  <Select id="a-role" name="roleKey" defaultValue="CONTRACTOR">
                    <option value="CONTRACTOR">Contratista</option>
                    <option value="VIEWER">Consulta</option>
                  </Select>
                </Field>
              </div>
              <Field label="Empresa" htmlFor="a-company">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select aria-label="Tipo de empresa" value={companyMode} onChange={(e) => setCompanyMode(e.target.value as "existing" | "new")} className="sm:w-40">
                    {companies.length ? <option value="existing">Existente</option> : null}
                    <option value="new">Nueva</option>
                  </Select>
                  {companyMode === "existing" ? (
                    <div className="flex-1">
                      <Select id="a-company" name="companyId" defaultValue={match?.id}>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <Input id="a-company" name="newCompanyName" defaultValue={request.companyName} className="flex-1" required maxLength={120} />
                  )}
                </div>
              </Field>
              <Field label="Tipo de identidad" htmlFor="a-identity">
                <Select id="a-identity" name="identityType" defaultValue="GUEST">
                  <option value="GUEST">Invitado externo (Microsoft Entra B2B)</option>
                  <option value="MEMBER">Cuenta de la organización</option>
                </Select>
              </Field>
              <div>
                <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">Proyectos autorizados (obligatorio)</p>
                <ProjectChecklist projects={projects} selected={projectIds} onChange={setProjectIds} idPrefix={`r-${request.id}`} />
              </div>
              <Field label="Notas internas" htmlFor="a-notes">
                <Textarea id="a-notes" name="notes" rows={2} maxLength={1000} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setApprove(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={projectIds.length === 0} data-testid="confirm-approve">
                Aprobar y autorizar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog === "reject" ? "Rechazar solicitud" : "Solicitar información adicional"}
        description={dialog === "info" ? "El solicitante verá este mensaje al consultar su solicitud con el código de seguimiento." : undefined}
        tone={dialog === "reject" ? "danger" : "primary"}
        confirmLabel={dialog === "reject" ? "Rechazar" : "Enviar solicitud"}
        loading={pending}
        confirmDisabled={text.trim().length < (dialog === "info" ? 5 : 3)}
        onConfirm={async () => {
          const ok = await run(
            () => api(`/api/admin/access-requests/${request.id}/${dialog === "reject" ? "reject" : "request-info"}`, { method: "POST", json: dialog === "reject" ? { notes: text } : { message: text } }),
            dialog === "reject" ? "Solicitud rechazada" : "Información solicitada",
          );
          if (ok) {
            setDialog(null);
            setText("");
          }
        }}
      >
        <Field label={dialog === "reject" ? "Motivo" : "Información requerida"} htmlFor="req-text" required>
          <Textarea id="req-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
