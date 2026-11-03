import "server-only";
import { db } from "@/lib/db/prisma";
import { dataEnvironment } from "@/lib/config/env";
import type { AuditResult, Prisma } from "@/generated/prisma/client";
import type { RequestInfo } from "@/lib/http/request-info";

export type AuditCategory = "AUTH" | "USERS" | "COMPANIES" | "ACCESS_REQUESTS" | "PROJECTS" | "FOLDERS" | "DOCUMENTS" | "SETTINGS" | "SECURITY";

export type AuditAction =
  | "AUTH_LOGIN" | "AUTH_LOGIN_DENIED" | "AUTH_LOGOUT" | "AUTH_IDENTITY_BOUND" | "AUTH_IDENTITY_MISMATCH" | "AUTH_SESSION_REVOKED"
  | "USER_CREATED" | "USER_UPDATED" | "USER_AUTHORIZED" | "USER_SUSPENDED" | "USER_REACTIVATED" | "USER_REJECTED"
  | "USER_ROLE_CHANGED" | "USER_PROJECTS_CHANGED" | "USER_IDENTITY_LINKED"
  | "INVITATION_SENT" | "INVITATION_FAILED"
  | "COMPANY_CREATED" | "COMPANY_UPDATED"
  | "ACCESS_REQUEST_CREATED" | "ACCESS_REQUEST_APPROVED" | "ACCESS_REQUEST_REJECTED" | "ACCESS_REQUEST_INFO_REQUESTED"
  | "PROJECT_CREATED" | "PROJECT_UPDATED" | "PROJECT_LOCATION_SET" | "PROJECT_LOCATION_REMOVED" | "PROJECT_STRUCTURE_VERIFIED" | "PROJECT_STAGE_FOLDER_CREATED"
  | "FOLDER_CREATED" | "FOLDER_CREATE_FAILED" | "FOLDER_RENAMED" | "FOLDER_DELETED" | "FOLDER_OPERATION_FAILED"
  | "UPLOAD_STARTED" | "DOCUMENT_UPLOADED" | "DOCUMENT_UPLOAD_FAILED" | "DOCUMENT_UPLOAD_CANCELLED"
  | "SETTINGS_UPDATED"
  | "ACCESS_DENIED";

export type Actor = {
  userId: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  role?: string | null;
  request?: RequestInfo;
};

export type AuditEntry = {
  actor: Actor;
  action: AuditAction;
  category: AuditCategory;
  result: AuditResult;
  projectId?: string | null;
  projectCode?: string | null;
  targetType?: string;
  targetId?: string | null;
  documentName?: string | null;
  folderPath?: string | null;
  details?: Record<string, unknown>;
};

const SENSITIVE_KEY = /token|secret|password|authorization|cookie|uploadurl|upload_session|sessionurl|assertion|code_?verifier/i;

/** Elimina recursivamente cualquier campo potencialmente sensible antes de registrarlo. */
export function sanitizeDetails(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[profundidad máxima]";
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitizeDetails(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[omitido]" : sanitizeDetails(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return value.slice(0, 2000) + "…";
  if (typeof value === "bigint") return Number(value);
  return value;
}

let captureCache: { at: number; ip: boolean; ua: boolean } | null = null;
async function captureFlags() {
  if (captureCache && Date.now() - captureCache.at < 15_000) return captureCache;
  // Importación diferida para evitar dependencia circular con settings.service.
  const { getSettings } = await import("./settings.service");
  const s = await getSettings();
  captureCache = { at: Date.now(), ip: s.audit.captureIp, ua: s.audit.captureUserAgent };
  return captureCache;
}

/**
 * Registra un evento de auditoría. Nunca lanza: un fallo de auditoría se informa
 * en el registro del servidor pero no interrumpe la operación ya ejecutada.
 */
export async function audit(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
  try {
    const flags = await captureFlags();
    const client = tx ?? db;
    await client.auditLog.create({
      data: {
        actorUserId: entry.actor.userId,
        actorEmail: entry.actor.email ?? null,
        actorName: entry.actor.name ?? null,
        actorCompany: entry.actor.company ?? null,
        actorRole: entry.actor.role ?? null,
        action: entry.action,
        category: entry.category,
        result: entry.result,
        projectId: entry.projectId ?? null,
        projectCode: entry.projectCode ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        documentName: entry.documentName ?? null,
        folderPath: entry.folderPath ?? null,
        ipAddress: flags.ip ? entry.actor.request?.ip ?? null : null,
        userAgent: flags.ua ? entry.actor.request?.userAgent ?? null : null,
        details: entry.details ? (sanitizeDetails(entry.details) as Prisma.InputJsonValue) : undefined,
        environment: dataEnvironment(),
      },
    });
  } catch (err) {
    console.error("[audit] No se pudo registrar el evento", entry.action, err instanceof Error ? err.message : err);
    if (tx) throw err;
  }
}
