"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu as MenuIcon, ChevronDown, FlaskConical } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Sheet } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { BrandLockup } from "./brand";
import { NAV_ICONS } from "./nav-icons";
import { api } from "@/lib/client/api";
import { ROLE_LABEL } from "@/components/shared/status";
import type { NavItem } from "@/lib/authz/policy";

type ShellUser = { fullName: string; email: string; role: string; company: string | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function NavList({ items, onNavigate, badges }: { items: NavItem[]; onNavigate?: () => void; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Navegación principal">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        const badge = badges?.[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-3 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors",
              active ? "bg-white/[0.11] text-white" : "text-brand-100/75 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {Icon ? <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-brand-100/60 group-hover:text-brand-100")} aria-hidden /> : null}
            <span className="truncate">{item.label}</span>
            {badge ? (
              <span className="ml-auto rounded-sm bg-warning-100 px-1.5 text-2xs font-semibold text-warning-800" data-numeric>
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ items, branding, onNavigate, badges, mode }: { items: NavItem[]; branding: { portalName: string; subtitle: string; organizationName: string }; onNavigate?: () => void; badges?: Record<string, number>; mode: "demo" | "production" }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-white/[0.08] px-4">
        <BrandLockup name={branding.portalName} subtitle={branding.organizationName || "Gestión documental"} inverted />
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavList items={items} onNavigate={onNavigate} badges={badges} />
      </div>
      <div className="border-t border-white/[0.08] px-4 py-3 text-2xs leading-4 text-brand-100/55">
        {mode === "demo" ? (
          <span className="inline-flex items-center gap-1.5 text-warning-100">
            <FlaskConical className="size-3.5" aria-hidden /> Entorno de demostración
          </span>
        ) : (
          <span>Repositorio oficial: SharePoint Online</span>
        )}
      </div>
    </div>
  );
}

export function AppShell({
  user,
  items,
  branding,
  mode,
  badges,
  children,
}: {
  user: ShellUser;
  items: NavItem[];
  branding: { portalName: string; subtitle: string; organizationName: string };
  mode: "demo" | "production";
  badges?: Record<string, number>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      const res = await api<{ redirect: string }>("/api/auth/logout", { method: "POST" });
      // Recarga completa intencional: descarta todo el estado del cliente (y permite la URL externa de cierre de Entra ID).
      window.location.href = res.redirect || "/login";
    } catch {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa tras cerrar sesión
      window.location.href = "/login";
    }
  }

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-brand-900 lg:block">
        <SidebarContent items={items} branding={branding} badges={badges} mode={mode} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Menú de navegación">
        <SidebarContent items={items} branding={branding} badges={badges} mode={mode} onNavigate={() => setMobileOpen(false)} />
      </Sheet>

      <div className="flex min-h-dvh flex-col">
        {mode === "demo" ? (
          <div className="flex items-center justify-center gap-2 border-b border-warning-100 bg-warning-50 px-4 py-1.5 text-center text-2xs font-medium text-warning-800 sm:text-[0.75rem]" role="status" data-testid="demo-banner">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            Modo demostración: datos ficticios. Los documentos se guardan en un almacenamiento local de prueba y no se envían a SharePoint.
          </div>
        ) : null}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button type="button" className="-ml-1 rounded-md p-2 text-ink-700 hover:bg-ink-900/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <MenuIcon className="size-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-500 max-lg:hidden">{branding.subtitle}</div>
          <div className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-ink-900 lg:hidden">{branding.portalName}</div>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-ink-900/5" data-testid="user-menu">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-800">{initials(user.fullName)}</span>
                <span className="hidden min-w-0 text-left leading-tight sm:block">
                  <span className="block max-w-48 truncate text-[0.8125rem] font-medium text-ink-900">{user.fullName}</span>
                  <span className="block max-w-48 truncate text-2xs text-ink-500">{user.company ?? ROLE_LABEL[user.role]}</span>
                </span>
                <ChevronDown className="size-3.5 text-ink-500" aria-hidden />
              </button>
            </MenuTrigger>
            <MenuContent className="w-64">
              <MenuLabel className="normal-case tracking-normal">
                <span className="block text-[0.8125rem] font-semibold text-ink-900">{user.fullName}</span>
                <span className="block truncate font-normal text-ink-500">{user.email}</span>
                <span className="mt-1 block font-normal text-ink-500">{ROLE_LABEL[user.role]}</span>
              </MenuLabel>
              <MenuSeparator />
              {user.role !== "ADMIN" ? (
                <MenuItem asChild>
                  <Link href="/perfil">Mi perfil</Link>
                </MenuItem>
              ) : null}
              <MenuItem onSelect={signOut} disabled={signingOut} data-testid="logout">
                <LogOut aria-hidden /> Cerrar sesión
              </MenuItem>
            </MenuContent>
          </Menu>
        </header>
        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
