import "server-only";
import { z } from "zod";

/**
 * Configuración del servidor validada con Zod.
 * Ningún valor de este módulo se envía al navegador.
 *
 * APP_MODE:
 *  - "demo":       datos ficticios, inicio de sesión de demostración y almacenamiento local.
 *                  NUNCA se conecta con SharePoint ni simula hacerlo.
 *  - "production": Microsoft Entra ID + Microsoft Graph + SharePoint Online reales.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const scopeList = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v : fallback).split(/[\s,]+/).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "production"]),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY debe ser 32 bytes en base64"),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Microsoft Entra ID
  ENTRA_TENANT_ID: optionalString,
  ENTRA_CLIENT_ID: optionalString,
  ENTRA_CLIENT_SECRET: optionalString,
  ENTRA_CLIENT_CERT_THUMBPRINT: optionalString,
  ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH: optionalString,
  ENTRA_AUTHORITY_HOST: z.string().url().default("https://login.microsoftonline.com"),

  // Microsoft Graph
  GRAPH_BASE_URL: z.string().url().default("https://graph.microsoft.com/v1.0"),
  GRAPH_DELEGATED_SCOPES: scopeList("Sites.Selected"),
  GRAPH_ADMIN_SCOPES: scopeList("User.Invite.All User.ReadBasic.All"),

  // SharePoint Online
  SHAREPOINT_HOSTNAME: optionalString,
  SHAREPOINT_SITE_PATH: optionalString,
  SHAREPOINT_LIBRARY_URL: optionalString,
  SHAREPOINT_SITE_ID: optionalString,
  SHAREPOINT_DRIVE_ID: optionalString,

  // Demostración
  DEMO_STORAGE_DIR: z.string().default("./.demo-storage"),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración del servidor inválida:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Solo para pruebas: fuerza la relectura de process.env. */
export function resetEnvCache() {
  cached = null;
}

export const isDemoMode = () => env().APP_MODE === "demo";
export const dataEnvironment = () => (isDemoMode() ? "DEMO" : "PRODUCTION") as "DEMO" | "PRODUCTION";

export type IntegrationCheck = { key: string; label: string; ok: boolean; detail: string };

/**
 * Estado de la configuración de Microsoft 365. Se usa para mostrar con claridad
 * qué falta completar, en lugar de simular funcionalidades.
 */
export function microsoftConfigStatus(): { ready: boolean; checks: IntegrationCheck[] } {
  const e = env();
  const hasCredential = Boolean(e.ENTRA_CLIENT_SECRET || (e.ENTRA_CLIENT_CERT_THUMBPRINT && e.ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH));
  const checks: IntegrationCheck[] = [
    { key: "tenant", label: "Tenant ID (ENTRA_TENANT_ID)", ok: Boolean(e.ENTRA_TENANT_ID), detail: "Identificador del directorio de Microsoft Entra ID." },
    { key: "client", label: "Client ID (ENTRA_CLIENT_ID)", ok: Boolean(e.ENTRA_CLIENT_ID), detail: "Identificador de la aplicación registrada." },
    { key: "credential", label: "Secreto o certificado de la aplicación", ok: hasCredential, detail: "ENTRA_CLIENT_SECRET o ENTRA_CLIENT_CERT_THUMBPRINT + ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH." },
    { key: "site", label: "Site ID de SharePoint (SHAREPOINT_SITE_ID)", ok: Boolean(e.SHAREPOINT_SITE_ID), detail: "Se obtiene con `npm run sp:discover` o desde Configuración > Conexión." },
    { key: "drive", label: "Drive ID de la biblioteca (SHAREPOINT_DRIVE_ID)", ok: Boolean(e.SHAREPOINT_DRIVE_ID), detail: "Biblioteca «Proyectos de Inversión Operaciones»." },
  ];
  return { ready: checks.every((c) => c.ok), checks };
}

export function entraConfigured(): boolean {
  const e = env();
  return Boolean(e.ENTRA_TENANT_ID && e.ENTRA_CLIENT_ID && (e.ENTRA_CLIENT_SECRET || (e.ENTRA_CLIENT_CERT_THUMBPRINT && e.ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH)));
}
