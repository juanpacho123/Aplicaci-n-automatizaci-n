import "server-only";
import { env, isDemoMode } from "@/lib/config/env";
import { GraphClient } from "@/lib/graph/client";
import { getDelegatedGraphToken, type TokenScopeSet } from "@/lib/auth/graph-token";
import { Errors } from "@/lib/http/errors";
import type { AuthContext } from "@/lib/authz/guards";
import { DemoStorageProvider, DEMO_DRIVE_ID } from "./demo-provider";
import { GraphStorageProvider } from "./graph-provider";
import type { StorageProvider } from "./types";

type Factory = (ctx: AuthContext) => StorageProvider;
let override: Factory | null = null;

/** Solo pruebas: permite inyectar un proveedor (p. ej. Graph con fetch simulado). */
export function setStorageFactoryForTests(f: Factory | null) {
  override = f;
}

export function graphClientFor(ctx: Pick<AuthContext, "session">, scopeSet: TokenScopeSet = "files") {
  return new GraphClient(() => getDelegatedGraphToken(ctx.session, scopeSet), env().GRAPH_BASE_URL);
}

/**
 * Proveedor de almacenamiento para el usuario de la solicitud.
 * En producción, todas las operaciones se ejecutan con el token DELEGADO del usuario:
 * SharePoint registra al contratista como autor y aplica sus permisos reales.
 */
export function storageFor(ctx: AuthContext): StorageProvider {
  if (override) return override(ctx);
  if (isDemoMode()) return new DemoStorageProvider(ctx.user.fullName);
  return new GraphStorageProvider(graphClientFor(ctx, "files"));
}

export function storageKind(): "demo" | "sharepoint" {
  return isDemoMode() ? "demo" : "sharepoint";
}

/** Biblioteca documental configurada (Site ID / Drive ID). */
export function configuredLibrary(): { siteId: string; driveId: string } {
  if (isDemoMode()) return { siteId: "demo-site", driveId: DEMO_DRIVE_ID };
  const e = env();
  if (!e.SHAREPOINT_SITE_ID || !e.SHAREPOINT_DRIVE_ID) throw Errors.configMissing("Site ID y Drive ID de la biblioteca de SharePoint (SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID)");
  return { siteId: e.SHAREPOINT_SITE_ID, driveId: e.SHAREPOINT_DRIVE_ID };
}

export type { StorageProvider, DriveItem } from "./types";
