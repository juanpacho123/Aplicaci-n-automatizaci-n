import { authenticate, type AuthContext } from "@/lib/authz/guards";
import type { SessionWithUser } from "@/lib/auth/session";
import { req, sessionFor } from "./fixtures";
import { db } from "@/lib/db/prisma";
import { randomToken, sha256 } from "@/lib/security/crypto";

/** Contexto de autorización real (pasa por authenticate) para invocar servicios directamente. */
export async function ctxFor(userId: string): Promise<AuthContext> {
  const session = await sessionFor(userId);
  return authenticate(req("GET", "/api/auth/me", { session }));
}

export async function buildTestContext(session: SessionWithUser): Promise<AuthContext> {
  // Nueva sesión para el mismo usuario (el token original no se conserva en claro).
  const token = randomToken(32);
  await db.session.create({ data: { tokenHash: sha256(token), csrfToken: "c", userId: session.userId, authMethod: "DEMO", expiresAt: new Date(Date.now() + 3600_000) } });
  return authenticate(req("GET", "/api/auth/me", { session: { token, csrf: "c" } }));
}
