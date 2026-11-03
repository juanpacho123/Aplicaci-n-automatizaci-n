import "server-only";
import { env } from "@/lib/config/env";

export type RequestInfo = { ip: string | null; userAgent: string | null };

/** IP de origen: solo se confía en X-Forwarded-For si TRUST_PROXY=true. */
export function requestInfo(headers: Headers): RequestInfo {
  let ip: string | null = null;
  if (env().TRUST_PROXY) {
    ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
  }
  const ua = headers.get("user-agent");
  return { ip, userAgent: ua ? ua.slice(0, 400) : null };
}
