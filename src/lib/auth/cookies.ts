import "server-only";
import { env } from "@/lib/config/env";

/** Nombres de cookie. Con HTTPS se usa el prefijo __Host- (Secure, Path=/, sin Domain). */
export function cookieNames() {
  const secure = env().APP_URL.startsWith("https://");
  const p = secure ? "__Host-" : "";
  return { secure, session: `${p}pgd_session`, csrf: `${p}pgd_csrf`, oauth: `${p}pgd_oauth` };
}

export const SESSION_COOKIE_CANDIDATES = ["__Host-pgd_session", "pgd_session"];
