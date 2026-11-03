import { NextResponse, type NextRequest } from "next/server";
import { env, entraConfigured } from "@/lib/config/env";
import { cookieNames } from "@/lib/auth/cookies";
import { loginScopes, msalClient, redirectUri } from "@/lib/auth/msal";
import { openOAuthState } from "@/lib/auth/oauth-state";
import { candidateEmails, resolveIdentity } from "@/lib/auth/identity.service";
import { establishSession } from "@/lib/auth/login.service";
import { db } from "@/lib/db/prisma";
import { requestInfo } from "@/lib/http/request-info";
import { safeEqual } from "@/lib/security/crypto";
import { audit } from "@/lib/services/audit.service";

function denied(base: string, reason: string) {
  const res = NextResponse.redirect(new URL(`/acceso-denegado?motivo=${encodeURIComponent(reason)}`, base), 303);
  res.cookies.set(cookieNames().oauth, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * Retorno de Microsoft Entra ID. Valida state, nonce y PKCE; canjea el código en el
 * servidor (el token nunca llega al navegador) y asocia la identidad a un registro autorizado.
 */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  if (!entraConfigured()) return NextResponse.redirect(new URL("/login?error=CONFIGURATION_MISSING", base), 303);
  const info = requestInfo(req.headers);
  const params = req.nextUrl.searchParams;
  const saved = openOAuthState(req.cookies.get(cookieNames().oauth)?.value);
  const state = params.get("state") ?? "";

  if (params.get("error")) {
    await audit({ actor: { userId: null, request: info }, action: "AUTH_LOGIN_DENIED", category: "AUTH", result: "FAILURE", details: { reason: "IDP_ERROR", error: params.get("error"), description: params.get("error_description")?.slice(0, 300) } });
    return denied(base, "IDP_ERROR");
  }
  if (!saved || !state || !safeEqual(state, saved.state)) {
    await audit({ actor: { userId: null, request: info }, action: "AUTH_LOGIN_DENIED", category: "SECURITY", result: "DENIED", details: { reason: "STATE_MISMATCH" } });
    return denied(base, "STATE_MISMATCH");
  }
  const code = params.get("code");
  if (!code) return denied(base, "IDP_ERROR");

  let partitionKey: string | null = null;
  try {
    const client = msalClient(`login:${saved.state}`);
    const result = await client.acquireTokenByCode({ code, scopes: loginScopes(), redirectUri: redirectUri(), codeVerifier: saved.codeVerifier, state });
    const claims = (result.idTokenClaims ?? {}) as Record<string, unknown>;
    partitionKey = result.account?.homeAccountId ?? null;
    if (claims.nonce !== saved.nonce || !partitionKey) {
      if (partitionKey) await db.tokenCache.deleteMany({ where: { partitionKey } });
      await audit({ actor: { userId: null, request: info }, action: "AUTH_LOGIN_DENIED", category: "SECURITY", result: "DENIED", details: { reason: "NONCE_MISMATCH" } });
      return denied(base, "STATE_MISMATCH");
    }
    if (claims.aud !== env().ENTRA_CLIENT_ID) {
      await db.tokenCache.deleteMany({ where: { partitionKey } });
      return denied(base, "TENANT_MISMATCH");
    }
    const resolution = await resolveIdentity(
      {
        tid: String(claims.tid ?? ""),
        oid: String(claims.oid ?? ""),
        emails: candidateEmails(claims),
        name: typeof claims.name === "string" ? claims.name : null,
        isGuest: typeof claims.idp === "string" && !String(claims.idp).includes(String(claims.tid ?? "")) ? true : claims.acct === 1,
      },
      env().ENTRA_TENANT_ID!,
      info,
    );
    if (!resolution.ok) {
      // Identidad no autorizada: no se conservan sus tokens.
      await db.tokenCache.deleteMany({ where: { partitionKey } });
      return denied(base, resolution.reason);
    }
    await db.tokenCache.updateMany({ where: { partitionKey }, data: { userId: resolution.user.id } });
    return await establishSession({
      user: resolution.user,
      authMethod: "ENTRA_ID",
      msalPartitionKey: partitionKey,
      request: info,
      returnTo: saved.returnTo,
      baseUrl: base,
      details: { bound: resolution.bound, activated: resolution.activated },
    });
  } catch (err) {
    if (partitionKey) await db.tokenCache.deleteMany({ where: { partitionKey } }).catch(() => undefined);
    console.error("[auth/callback]", err instanceof Error ? err.message : err);
    await audit({ actor: { userId: null, request: info }, action: "AUTH_LOGIN_DENIED", category: "AUTH", result: "FAILURE", details: { reason: "TOKEN_EXCHANGE_FAILED" } });
    return denied(base, "LOGIN_FAILED");
  }
}
