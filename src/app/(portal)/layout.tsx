import { AppShell } from "@/components/layout/app-shell";
import { requirePageAuth } from "@/lib/authz/guards";
import { navigationFor } from "@/lib/authz/policy";
import { isDemoMode } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";
import { getBranding } from "@/lib/services/settings.service";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageAuth();
  const branding = await getBranding();
  const badges: Record<string, number> = {};
  if (ctx.role === "ADMIN") {
    const pending = await db.accessRequest.count({ where: { status: "PENDING" } });
    if (pending) badges["/admin/solicitudes"] = pending;
  }
  return (
    <AppShell
      user={{ fullName: ctx.user.fullName, email: ctx.user.email, role: ctx.role, company: ctx.user.company?.name ?? null }}
      items={navigationFor(ctx.role)}
      branding={{ portalName: branding.portalName, subtitle: branding.subtitle, organizationName: branding.organizationName }}
      mode={isDemoMode() ? "demo" : "production"}
      badges={badges}
    >
      {children}
    </AppShell>
  );
}
