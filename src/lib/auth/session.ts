import "server-only";
import { db } from "@/lib/db/prisma";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { getSettings } from "@/lib/services/settings.service";
import type { AuthMethod } from "@/generated/prisma/client";
import type { RequestInfo } from "@/lib/http/request-info";

export type SessionWithUser = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

export async function createSession(params: {
  userId: string;
  authMethod: AuthMethod;
  msalPartitionKey?: string | null;
  request: RequestInfo;
}) {
  const settings = await getSettings();
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + settings.auth.sessionAbsoluteHours * 3600_000);
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      csrfToken,
      userId: params.userId,
      authMethod: params.authMethod,
      msalPartitionKey: params.msalPartitionKey ?? null,
      ipAddress: params.request.ip,
      userAgent: params.request.userAgent,
      expiresAt,
    },
  });
  return { token, csrfToken, session, maxAgeSeconds: settings.auth.sessionAbsoluteHours * 3600 };
}

async function loadSession(token: string) {
  return db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { company: true } } },
  });
}

/**
 * Valida el token de sesión: existencia, revocación, caducidad absoluta e inactividad.
 * Devuelve null si la sesión no es válida (y la revoca si expiró).
 */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionWithUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await loadSession(token);
  if (!session || session.revokedAt) return null;
  const now = Date.now();
  const settings = await getSettings();
  const idleLimit = session.lastSeenAt.getTime() + settings.auth.sessionIdleMinutes * 60_000;
  if (session.expiresAt.getTime() <= now || idleLimit <= now) {
    await revokeSession(session.id, "expired");
    return null;
  }
  // Actualiza la actividad como máximo una vez por minuto.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  return session;
}

export async function revokeSession(sessionId: string, reason: string) {
  await db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
}

/**
 * Invalida todas las sesiones de la aplicación de un usuario y elimina su caché
 * de tokens de Microsoft, de modo que no pueda ejecutar más operaciones.
 */
export async function revokeAllUserSessions(userId: string, reason: string) {
  const [sessions] = await db.$transaction([
    db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }),
    db.tokenCache.deleteMany({ where: { userId } }),
  ]);
  return sessions.count;
}
