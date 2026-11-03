import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import { DENIAL_MESSAGES, type DenialReason } from "@/lib/auth/identity.service";

export const metadata = { title: "Acceso no autorizado" };

const EXTRA: Record<string, string> = {
  STATE_MISMATCH: "La solicitud de inicio de sesión no pudo verificarse. Inicie el proceso nuevamente.",
  IDP_ERROR: "Microsoft no completó el inicio de sesión.",
  LOGIN_FAILED: "No fue posible completar el inicio de sesión. Intente de nuevo.",
  FORBIDDEN: "No tiene permisos para acceder a esa sección.",
};

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo = "NOT_AUTHORIZED" } = await searchParams;
  const message = DENIAL_MESSAGES[motivo as DenialReason] ?? EXTRA[motivo] ?? DENIAL_MESSAGES.NOT_AUTHORIZED;
  const canRequest = motivo === "NOT_AUTHORIZED";
  return (
    <div className="w-full max-w-md">
      <Panel className="px-6 py-6">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger-700" aria-hidden />
          <div>
            <h1 className="text-base font-semibold" data-testid="denied-title">Acceso no autorizado</h1>
            <p className="mt-1 text-[0.8125rem] text-ink-700" data-testid="denied-reason">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {motivo === "FORBIDDEN" ? (
            <Link href="/" className={buttonVariants({ variant: "primary" })}>Volver al inicio</Link>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "secondary" })}>Volver a iniciar sesión</Link>
          )}
          {canRequest ? <Link href="/solicitar-acceso" className={buttonVariants({ variant: "primary" })}>Solicitar acceso</Link> : null}
        </div>
      </Panel>
    </div>
  );
}
