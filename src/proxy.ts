import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antes "middleware"): cabeceras de seguridad, CSP con nonce y una
 * comprobación OPTIMISTA de sesión para las páginas protegidas.
 * La autorización real se valida siempre en el servidor (páginas y API).
 */
const PUBLIC_PREFIXES = ["/login", "/solicitar-acceso", "/acceso-denegado", "/api/", "/_next/", "/favicon"];
const SESSION_COOKIES = ["__Host-pgd_session", "pgd_session"];

function securityHeaders(res: NextResponse, https: boolean) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (https) res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const https = (process.env.APP_URL ?? "").startsWith("https://");

  if (pathname.startsWith("/api/")) return securityHeaders(NextResponse.next(), https);

  const isPublic = pathname === "/" ? false : PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?returnTo=${encodeURIComponent(pathname + search)}`;
    return securityHeaders(NextResponse.redirect(url), https);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://login.microsoftonline.com",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return securityHeaders(res, https);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
