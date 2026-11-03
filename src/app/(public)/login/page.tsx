import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, ROLE_LABEL } from "@/components/shared/status";
import { isDemoMode, microsoftConfigStatus, entraConfigured } from "@/lib/config/env";
import { getPageAuth } from "@/lib/authz/guards";
import { homePathFor } from "@/lib/authz/policy";
import { safeReturnTo } from "@/lib/auth/oauth-state";
import { db } from "@/lib/db/prisma";
import { getBranding } from "@/lib/services/settings.service";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Iniciar sesión" };

const ERRORS: Record<string, string> = {
  CONFIGURATION_MISSING: "El inicio de sesión con Microsoft aún no está configurado.",
  RATE_LIMITED: "Demasiados intentos de inicio de sesión. Espere unos minutos.",
  LOGIN_UNAVAILABLE: "No fue posible contactar con Microsoft Entra ID. Intente de nuevo.",
  INVALID: "La solicitud de inicio de sesión no es válida.",
};

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getPageAuth();
  if (ctx) redirect(homePathFor(ctx.role));
  const returnTo = safeReturnTo(sp.returnTo);
  const branding = await getBranding();
  const demo = isDemoMode();
  const config = microsoftConfigStatus();
  const demoUsers = demo
    ? await db.user.findMany({ orderBy: [{ roleKey: "asc" }, { fullName: "asc" }], include: { company: true }, take: 20 })
    : [];

  return (
    <div className={demo ? "w-full max-w-lg" : "w-full max-w-md"}>
      <Panel>
        <div className="border-b border-line px-6 py-5">
          <h1 className="text-lg font-semibold">Iniciar sesión</h1>
          <p className="mt-1 text-[0.8125rem] text-ink-600">{branding.subtitle}</p>
        </div>
        <div className="space-y-4 px-6 py-5">
          {sp.expired ? <Alert tone="info">Su sesión finalizó. Inicie sesión nuevamente para continuar.</Alert> : null}
          {sp.error && ERRORS[sp.error] ? <Alert tone="danger">{ERRORS[sp.error]}</Alert> : null}

          {!demo ? (
            entraConfigured() ? (
              <>
                <p className="text-[0.8125rem] text-ink-700">
                  Utilice la cuenta de Microsoft autorizada por el administrador. Si es contratista externo, ingrese con el correo al que recibió la invitación; Microsoft verificará su identidad.
                </p>
                <a href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`} className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-full")} data-testid="microsoft-login">
                  <MicrosoftLogo /> Iniciar sesión con Microsoft
                </a>
              </>
            ) : (
              <Alert tone="warning" title="Configuración administrativa pendiente">
                El inicio de sesión con Microsoft Entra ID no está disponible porque falta completar la configuración del servidor:
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {config.checks
                    .filter((c) => !c.ok && ["tenant", "client", "credential"].includes(c.key))
                    .map((c) => (
                      <li key={c.key}>{c.label}</li>
                    ))}
                </ul>
                <p className="mt-2">Consulte docs/entra-id.md y docs/configuracion-pendiente.md.</p>
              </Alert>
            )
          ) : (
            <div className="space-y-3">
              <Alert tone="warning" title="Entorno de demostración">
                Inicio de sesión simulado con usuarios ficticios. En producción solo existe el acceso mediante Microsoft Entra ID.
              </Alert>
              <ul className="divide-y divide-line rounded-md border border-line" data-testid="demo-users">
                {demoUsers.map((u) => (
                  <li key={u.id}>
                    <form action="/api/auth/demo-login" method="post" className="flex items-center gap-3 px-3 py-2.5">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.8125rem] font-medium leading-5 text-ink-900">{u.fullName}</div>
                        <div className="truncate text-2xs text-ink-500">
                          {u.email}
                          {u.company ? ` · ${u.company.name}` : ""}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge tone={u.roleKey === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[u.roleKey]}</Badge>
                          {u.status !== "ACTIVE" ? <StatusBadge kind="user" value={u.status} /> : null}
                        </div>
                      </div>
                      <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid={`demo-login-${u.email}`}>
                        <FlaskConical aria-hidden /> Entrar
                      </button>
                    </form>
                  </li>
                ))}
                {demoUsers.length === 0 ? <li className="px-3 py-3 text-[0.8125rem] text-ink-500">No hay usuarios de demostración. Ejecute «npm run db:seed:demo».</li> : null}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t border-line bg-subtle px-6 py-3.5 text-[0.8125rem] sm:flex-row sm:justify-between">
          <Link href="/solicitar-acceso" className="font-medium text-action-600 hover:underline">
            Solicitar acceso
          </Link>
          <Link href="/solicitar-acceso/estado" className="text-ink-600 hover:text-ink-900 hover:underline">
            Consultar estado de una solicitud
          </Link>
        </div>
      </Panel>
    </div>
  );
}
