import { BrandLockup } from "@/components/layout/brand";
import { getBranding } from "@/lib/services/settings.service";
import { isDemoMode } from "@/lib/config/env";
import { FlaskConical } from "lucide-react";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {isDemoMode() ? (
        <div className="flex items-center justify-center gap-2 border-b border-warning-100 bg-warning-50 px-4 py-1.5 text-center text-[0.75rem] font-medium text-warning-800" data-testid="demo-banner">
          <FlaskConical className="size-3.5" aria-hidden /> Modo demostración: datos ficticios, sin conexión con SharePoint.
        </div>
      ) : null}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6">
          <BrandLockup name={branding.portalName} subtitle={branding.organizationName || branding.subtitle} />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">{children}</main>
      <footer className="border-t border-line bg-surface py-4 text-center text-2xs text-ink-500">
        {branding.organizationName ? `${branding.organizationName} · ` : ""}Acceso restringido a usuarios autorizados. Las actividades quedan registradas.
        {branding.supportEmail ? (
          <>
            {" "}· Soporte: <a className="text-action-600 hover:underline" href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>
          </>
        ) : null}
      </footer>
    </div>
  );
}
