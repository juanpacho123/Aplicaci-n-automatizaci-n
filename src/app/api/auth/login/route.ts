import { NextResponse, type NextRequest } from "next/server";
import { CryptoProvider } from "@azure/msal-node";
import { env, entraConfigured, isDemoMode } from "@/lib/config/env";
import { cookieNames } from "@/lib/auth/cookies";
import { loginScopes, msalClient, redirectUri, warmAuthorityMetadata } from "@/lib/auth/msal";
import { safeReturnTo, sealOAuthState } from "@/lib/auth/oauth-state";
import { randomToken } from "@/lib/security/crypto";
import { checkRateLimit, RateLimits } from "@/lib/security/rate-limit";
import { requestInfo } from "@/lib/http/request-info";
import { isAppError } from "@/lib/http/errors";

/** Inicia el flujo de código de autorización con PKCE contra Microsoft Entra ID. */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  if (isDemoMode()) return NextResponse.redirect(new URL("/login", base), 303);
  if (!entraConfigured()) return NextResponse.redirect(new URL("/login?error=CONFIGURATION_MISSING", base), 303);
  try {
    checkRateLimit(`login:${requestInfo(req.headers).ip ?? "anon"}`, RateLimits.login);
  } catch {
    return NextResponse.redirect(new URL("/login?error=RATE_LIMITED", base), 303);
  }
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const crypto = new CryptoProvider();
  const { verifier, challenge } = await crypto.generatePkceCodes();
  const state = randomToken(24);
  const nonce = randomToken(24);
  try {
    await warmAuthorityMetadata();
    const url = await msalClient(`login:${state}`).getAuthCodeUrl({
      scopes: loginScopes(),
      redirectUri: redirectUri(),
      state,
      nonce,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      prompt: "select_account",
      responseMode: "query",
    });
    const res = NextResponse.redirect(url, 303);
    const names = cookieNames();
    res.cookies.set(names.oauth, sealOAuthState({ state, nonce, codeVerifier: verifier, returnTo, createdAt: Date.now() }), {
      httpOnly: true,
      secure: names.secure,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error("[auth/login]", isAppError(err) ? err.message : err);
    return NextResponse.redirect(new URL("/login?error=LOGIN_UNAVAILABLE", base), 303);
  }
}
