"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { api, ApiError, errorMessage } from "@/lib/client/api";

type FieldErrors = Partial<Record<"fullName" | "companyName" | "email" | "requestedProject" | "justification", string>>;

export function AccessRequestForm() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [done, setDone] = React.useState<{ code: string | null } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api<{ trackingCode: string | null }>("/api/access-requests", { method: "POST", json: body });
      setDone({ code: res.trackingCode });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        const fields = (err.details?.fields as { path: string; message: string }[] | undefined) ?? [];
        setFieldErrors(Object.fromEntries(fields.map((f) => [f.path, f.message])));
      }
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4" data-testid="request-submitted">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
          <div>
            <p className="font-semibold text-ink-900">Solicitud registrada</p>
            <p className="text-[0.8125rem] text-ink-600">
              El administrador revisará la solicitud. Registrarla no concede acceso: si se aprueba, recibirá una invitación de Microsoft para verificar su identidad.
            </p>
          </div>
        </div>
        {done.code ? (
          <div className="rounded-md border border-line bg-subtle p-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.05em] text-ink-500">Código de seguimiento</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="path-text flex-1 select-all text-[0.875rem] text-ink-950" data-testid="tracking-code">{done.code}</code>
              <Button size="icon-sm" variant="ghost" aria-label="Copiar código" onClick={() => navigator.clipboard?.writeText(done.code!)}>
                <Copy />
              </Button>
            </div>
            <p className="mt-2 text-[0.75rem] text-ink-500">Guárdelo: es la única forma de consultar el estado y responder si se solicita información adicional. No se mostrará de nuevo.</p>
          </div>
        ) : (
          <Alert tone="info">Ya existen solicitudes abiertas para este correo. El administrador las revisará.</Alert>
        )}
        <div className="flex gap-2">
          <Link className="text-[0.8125rem] font-medium text-action-600 hover:underline" href="/solicitar-acceso/estado">
            Consultar estado
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Nombre completo" htmlFor="fullName" required error={fieldErrors.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required maxLength={120} aria-invalid={Boolean(fieldErrors.fullName)} />
      </Field>
      <Field label="Empresa" htmlFor="companyName" required error={fieldErrors.companyName}>
        <Input id="companyName" name="companyName" autoComplete="organization" required maxLength={120} aria-invalid={Boolean(fieldErrors.companyName)} />
      </Field>
      <Field label="Correo electrónico" htmlFor="email" required error={fieldErrors.email} hint="Debe ser el correo con el que se identificará ante Microsoft.">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={Boolean(fieldErrors.email)} />
      </Field>
      <Field label="Proyecto solicitado" htmlFor="requestedProject" required error={fieldErrors.requestedProject} hint="Nombre o código del proyecto en el que participa.">
        <Input id="requestedProject" name="requestedProject" required maxLength={200} aria-invalid={Boolean(fieldErrors.requestedProject)} />
      </Field>
      <Field label="Justificación" htmlFor="justification" error={fieldErrors.justification}>
        <Textarea id="justification" name="justification" maxLength={2000} rows={3} />
      </Field>
      <div className="hidden" aria-hidden>
        <label htmlFor="website">No completar</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" variant="primary" className="w-full" loading={pending}>
        Enviar solicitud
      </Button>
    </form>
  );
}

export function RequestStatusLookup() {
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ status: string; statusText: string; createdAt: string; infoRequestedMessage: string | null; canRespond: boolean } | null>(null);
  const [info, setInfo] = React.useState("");
  const [sent, setSent] = React.useState(false);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    setPending(true);
    setError(null);
    try {
      setResult(await api("/api/access-requests/status", { method: "POST", json: { code: code.trim() } }));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function respond(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/access-requests/respond", { method: "POST", json: { code: code.trim(), additionalInfo: info } });
      setSent(true);
      setInfo("");
      await lookup();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Código de seguimiento" htmlFor="code" className="flex-1">
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Button type="submit" variant="primary" loading={pending} disabled={code.trim().length < 10}>
          Consultar
        </Button>
      </form>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {sent ? <Alert tone="success">Información enviada. La solicitud volvió a estado pendiente de revisión.</Alert> : null}
      {result ? (
        <div className="rounded-md border border-line p-3.5" data-testid="request-status">
          <p className="text-2xs font-semibold uppercase tracking-[0.05em] text-ink-500">Estado</p>
          <p className="mt-0.5 text-sm font-medium text-ink-900">{result.statusText}</p>
          {result.infoRequestedMessage ? (
            <div className="mt-3 rounded-sm border-l-2 border-action-600 bg-action-50 px-3 py-2 text-[0.8125rem] text-ink-800">
              <span className="font-medium">Mensaje del administrador:</span> {result.infoRequestedMessage}
            </div>
          ) : null}
          {result.canRespond ? (
            <form onSubmit={respond} className="mt-3 space-y-2">
              <Field label="Información adicional" htmlFor="info">
                <Textarea id="info" value={info} onChange={(e) => setInfo(e.target.value)} maxLength={2000} rows={3} />
              </Field>
              <Button type="submit" variant="primary" loading={pending} disabled={info.trim().length < 3}>
                Enviar información
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
