import "server-only";
import { decrypt, encrypt } from "@/lib/security/crypto";

/** Estado temporal del flujo de autorización (state, nonce, PKCE), cifrado en cookie. */
export type OAuthState = { state: string; nonce: string; codeVerifier: string; returnTo: string; createdAt: number };

const MAX_AGE_MS = 10 * 60_000;

export function sealOAuthState(s: OAuthState): string {
  return encrypt(JSON.stringify(s), "oauth-state");
}

export function openOAuthState(sealed: string | undefined): OAuthState | null {
  if (!sealed) return null;
  try {
    const s = JSON.parse(decrypt(sealed, "oauth-state")) as OAuthState;
    if (Date.now() - s.createdAt > MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

/** Solo se permiten rutas internas relativas como destino posterior al inicio de sesión. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.includes("://")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value.slice(0, 300);
}
