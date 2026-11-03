import type { Metadata, Viewport } from "next";
import "@fontsource-variable/ibm-plex-sans/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import { Toaster } from "sonner";
import { getBranding } from "@/lib/services/settings.service";
import { DEFAULT_SETTINGS } from "@/lib/validation/settings-schema";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_SETTINGS.branding);
  return { title: { default: branding.portalName, template: `%s · ${branding.portalName}` }, description: branding.subtitle, robots: { index: false, follow: false } };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0c2340" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster position="top-right" toastOptions={{ classNames: { toast: "!rounded-md !border-line !text-[0.8125rem] !font-sans !shadow-overlay" } }} />
      </body>
    </html>
  );
}
