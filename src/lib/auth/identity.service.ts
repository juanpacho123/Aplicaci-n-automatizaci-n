import "server-only";
import { db } from "@/lib/db/prisma";
import { getSettings } from "@/lib/services/settings.service";
import { audit } from "@/lib/services/audit.service";
import type { RequestInfo } from "@/lib/http/request-info";
import type { User } from "@/generated/prisma/client";

/** Reclamaciones relevantes del token de identificación emitido por Entra ID. */
export type IdentityClaims = {
  tid: string;
  oid: string;
  /** Correos candidatos tomados de email / preferred_username / upn (ya normalizados). */
  emails: string[];
  name?: string | null;
  /** true si el emisor indica que es un invitado (idp distinto o acct=1). */
  isGuest?: boolean;
};

export type DenialReason =
  | "NOT_AUTHORIZED"
  | "TENANT_MISMATCH"
  | "IDENTITY_MISMATCH"
  | "PENDING_APPROVAL"
  | "SUSPENDED"
  | "REJECTED"
  | "BINDING_DISABLED";

export type IdentityResolution = { ok: true; user: User; bound: boolean; activated: boolean } | { ok: false; reason: DenialReason; userId?: string };

export const DENIAL_MESSAGES: Record<DenialReason, string> = {
  NOT_AUTHORIZED: "Su cuenta no está autorizada para usar el portal. Puede solicitar acceso al administrador.",
  TENANT_MISMATCH: "La cuenta no pertenece al directorio autorizado de la organización.",
  IDENTITY_MISMATCH: "La identidad autenticada no coincide con el registro autorizado para este correo. El intento ha sido registrado.",
  PENDING_APPROVAL: "Su registro está pendiente de aprobación por el administrador.",
  SUSPENDED: "Su acceso al portal está suspendido. Contacte al administrador.",
  REJECTED: "Su solicitud de acceso fue rechazada.",
  BINDING_DISABLED: "Su identidad aún no ha sido vinculada por el administrador.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

/** Extrae correos candidatos de las reclamaciones del token (no del navegador). */
export function candidateEmails(claims: Record<string, unknown>): string[] {
  const values = ["email", "preferred_username", "upn"]
    .map((k) => claims[k])
    .filter((v): v is string => typeof v === "string")
    .map(normalizeEmail)
    .filter((v) => EMAIL_RE.test(v) && !v.includes("#ext#"));
  return Array.from(new Set(values));
}

/**
 * Asocia la identidad autenticada a un registro previamente autorizado.
 *
 * 1. Se busca por (tid, oid): identificadores estables e inmutables.
 * 2. Si no existe, se permite el primer vínculo por correo verificado SOLO si el
 *    registro autorizado aún no tiene identidad asociada (y la configuración lo permite).
 * 3. Si el registro ya está vinculado a otro oid, se rechaza (intento de suplantación).
 */
export async function resolveIdentity(claims: IdentityClaims, expectedTenantId: string, request: RequestInfo): Promise<IdentityResolution> {
  const actor = { userId: null, email: claims.emails[0] ?? null, name: claims.name ?? null, request };

  if (!claims.tid || claims.tid.toLowerCase() !== expectedTenantId.toLowerCase()) {
    await audit({ actor, action: "AUTH_LOGIN_DENIED", category: "AUTH", result: "DENIED", details: { reason: "TENANT_MISMATCH", tid: claims.tid } });
    return { ok: false, reason: "TENANT_MISMATCH" };
  }

  let user = await db.user.findUnique({ where: { entraTenantId_entraObjectId: { entraTenantId: claims.tid, entraObjectId: claims.oid } } });
  let bind = false;

  if (!user) {
    const candidates = claims.emails.length ? await db.user.findMany({ where: { email: { in: claims.emails } } }) : [];
    if (candidates.length === 0) {
      await audit({ actor, action: "AUTH_LOGIN_DENIED", category: "AUTH", result: "DENIED", details: { reason: "NOT_AUTHORIZED", oid: claims.oid } });
      return { ok: false, reason: "NOT_AUTHORIZED" };
    }
    if (candidates.length > 1) {
      await audit({ actor, action: "AUTH_IDENTITY_MISMATCH", category: "SECURITY", result: "DENIED", details: { reason: "AMBIGUOUS_EMAIL", oid: claims.oid } });
      return { ok: false, reason: "IDENTITY_MISMATCH" };
    }
    const candidate = candidates[0];
    if (candidate.entraObjectId) {
      // El correo coincide pero la identidad estable es otra: posible suplantación.
      await audit({
        actor: { ...actor, email: candidate.email },
        action: "AUTH_IDENTITY_MISMATCH",
        category: "SECURITY",
        result: "DENIED",
        targetType: "user",
        targetId: candidate.id,
        details: { presentedOid: claims.oid, presentedTid: claims.tid },
      });
      return { ok: false, reason: "IDENTITY_MISMATCH", userId: candidate.id };
    }
    const settings = await getSettings();
    if (!settings.auth.allowFirstLoginEmailBinding) {
      await audit({ actor, action: "AUTH_LOGIN_DENIED", category: "AUTH", result: "DENIED", targetType: "user", targetId: candidate.id, details: { reason: "BINDING_DISABLED" } });
      return { ok: false, reason: "BINDING_DISABLED", userId: candidate.id };
    }
    user = candidate;
    bind = true;
  }

  const statusDenial: Partial<Record<User["status"], DenialReason>> = {
    PENDING_APPROVAL: "PENDING_APPROVAL",
    SUSPENDED: "SUSPENDED",
    REJECTED: "REJECTED",
  };
  const denied = statusDenial[user.status];
  if (denied) {
    await audit({
      actor: { ...actor, userId: user.id, email: user.email, name: user.fullName },
      action: "AUTH_LOGIN_DENIED",
      category: "AUTH",
      result: "DENIED",
      targetType: "user",
      targetId: user.id,
      details: { reason: denied },
    });
    return { ok: false, reason: denied, userId: user.id };
  }

  const activated = user.status === "INVITATION_SENT";
  const now = new Date();
  user = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user!.id },
      data: {
        ...(bind
          ? { entraTenantId: claims.tid, entraObjectId: claims.oid, identityBoundAt: now, identityType: claims.isGuest ? "GUEST" : user!.identityType === "UNKNOWN" ? "MEMBER" : user!.identityType }
          : {}),
        ...(activated ? { status: "ACTIVE", statusChangedAt: now, statusReason: "Invitación aceptada e identidad verificada" } : {}),
        lastLoginAt: now,
      },
    });
    if (activated) {
      await tx.invitation.updateMany({ where: { userId: updated.id, status: "SENT" }, data: { status: "REDEEMED", redeemedAt: now } });
    }
    return updated;
  });

  if (bind) {
    await audit({
      actor: { userId: user.id, email: user.email, name: user.fullName, request },
      action: "AUTH_IDENTITY_BOUND",
      category: "SECURITY",
      result: "SUCCESS",
      targetType: "user",
      targetId: user.id,
      details: { tid: claims.tid, oid: claims.oid },
    });
  }
  return { ok: true, user, bound: bind, activated };
}
