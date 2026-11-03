import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env, isDemoMode } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";
import { establishSession } from "@/lib/auth/login.service";
import { DENIAL_MESSAGES } from "@/lib/auth/identity.service";
import { assertSameOrigin } from "@/lib/authz/guards";
import { requestInfo } from "@/lib/http/request-info";
import { checkRateLimit, RateLimits } from "@/lib/security/rate-limit";
import { audit } from "@/lib/services/audit.service";

/**
 * SOLO MODO DEMOSTRACIÓN. Inicio de sesión con usuarios ficticios para probar la
 * interfaz. En modo producción esta ruta responde 404 y no existe alternativa a Entra ID.
 */
export async function POST(req: NextRequest) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  const base = env().APP_URL;
  try {
    assertSameOrigin(req);
  } catch {
    return new NextResponse(null, { status: 403 });
  }
  const info = requestInfo(req.headers);
  try {
    checkRateLimit(`demo-login:${info.ip ?? "local"}`, RateLimits.login);
  } catch {
    return NextResponse.redirect(new URL("/login?error=RATE_LIMITED", base), 303);
  }
  const form = await req.formData().catch(() => null);
  const parsed = z.object({ userId: z.string().uuid(), returnTo: z.string().optional() }).safeParse({ userId: form?.get("userId"), returnTo: form?.get("returnTo") ?? undefined });
  if (!parsed.success) return NextResponse.redirect(new URL("/login?error=INVALID", base), 303);
  const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return NextResponse.redirect(new URL("/acceso-denegado?motivo=NOT_AUTHORIZED", base), 303);
  if (user.status !== "ACTIVE") {
    const reason = user.status === "SUSPENDED" ? "SUSPENDED" : user.status === "REJECTED" ? "REJECTED" : "PENDING_APPROVAL";
    await audit({ actor: { userId: user.id, email: user.email, name: user.fullName, request: info }, action: "AUTH_LOGIN_DENIED", category: "AUTH", result: "DENIED", targetType: "user", targetId: user.id, details: { reason, method: "DEMO", message: DENIAL_MESSAGES[reason] } });
    return NextResponse.redirect(new URL(`/acceso-denegado?motivo=${reason}`, base), 303);
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const { safeReturnTo } = await import("@/lib/auth/oauth-state");
  return establishSession({ user, authMethod: "DEMO", request: info, returnTo: safeReturnTo(parsed.data.returnTo), baseUrl: base, details: { mode: "demo" } });
}
