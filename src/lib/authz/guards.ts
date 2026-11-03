import "server-only";
import type { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateSessionToken, revokeAllUserSessions, type SessionWithUser } from "@/lib/auth/session";
import { cookieNames } from "@/lib/auth/cookies";
import { env } from "@/lib/config/env";
import { Errors } from "@/lib/http/errors";
import { requestInfo, type RequestInfo } from "@/lib/http/request-info";
import { safeEqual } from "@/lib/security/crypto";
import { checkRateLimit, RateLimits } from "@/lib/security/rate-limit";
import { audit, type Actor } from "@/lib/services/audit.service";
import { can, permissionsFor, type Permission, type RoleKey } from "./policy";

export type AuthContext = {
  session: SessionWithUser;
  user: SessionWithUser["user"];
  role: RoleKey;
  permissions: ReadonlySet<Permission>;
  actor: Actor;
  request: RequestInfo;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function buildContext(session: SessionWithUser, request: RequestInfo): AuthContext {
  const role = session.user.roleKey as RoleKey;
  return {
    session,
    user: session.user,
    role,
    permissions: permissionsFor(role),
    request,
    actor: {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.fullName,
      company: session.user.company?.name ?? null,
      role,
      request,
    },
  };
}

/** Verifica que la solicitud con estado provenga del propio origen de la aplicación. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // Navegadores modernos lo envían en POST/PUT/DELETE; el token CSRF cubre el resto.
  if (origin !== new URL(env().APP_URL).origin) throw Errors.csrf();
}

/**
 * Autentica una solicitud de API. Comprueba en orden:
 * sesión válida → usuario ACTIVO → protección CSRF (métodos con efectos) → límite de solicitudes.
 */
export async function authenticate(req: NextRequest, opts: { rate?: keyof typeof RateLimits } = {}): Promise<AuthContext> {
  const names = cookieNames();
  const session = await validateSessionToken(req.cookies.get(names.session)?.value);
  if (!session) throw Errors.unauthenticated();
  const info = requestInfo(req.headers);

  if (session.user.status !== "ACTIVE") {
    // Usuario suspendido o no activo: se invalidan sus sesiones y se bloquea la operación.
    await revokeAllUserSessions(session.user.id, `user_${session.user.status.toLowerCase()}`);
    throw Errors.notActive();
  }

  if (!SAFE_METHODS.has(req.method)) {
    assertSameOrigin(req);
    const header = req.headers.get("x-csrf-token") ?? "";
    if (!header || !safeEqual(header, session.csrfToken)) throw Errors.csrf();
  }

  const rule = opts.rate ?? (SAFE_METHODS.has(req.method) ? "read" : "mutation");
  checkRateLimit(`${rule}:${session.user.id}`, RateLimits[rule]);
  return buildContext(session, info);
}

export async function requirePermission(ctx: AuthContext, permission: Permission, target?: { type: string; id?: string }) {
  if (!can(ctx.role, permission)) {
    await audit({
      actor: ctx.actor,
      action: "ACCESS_DENIED",
      category: "SECURITY",
      result: "DENIED",
      targetType: target?.type,
      targetId: target?.id,
      details: { permission },
    });
    throw Errors.forbidden();
  }
}

/** Para componentes de servidor (páginas): redirige si no hay sesión válida y activa. */
export async function getPageAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const session = await validateSessionToken(jar.get(cookieNames().session)?.value);
  if (!session || session.user.status !== "ACTIVE") return null;
  return buildContext(session, requestInfo(await headers()));
}

export async function requirePageAuth(permission?: Permission): Promise<AuthContext> {
  const ctx = await getPageAuth();
  if (!ctx) redirect("/login");
  if (permission && !can(ctx.role, permission)) {
    await audit({ actor: ctx.actor, action: "ACCESS_DENIED", category: "SECURITY", result: "DENIED", details: { permission, surface: "page" } });
    redirect("/acceso-denegado?motivo=FORBIDDEN");
  }
  return ctx;
}
