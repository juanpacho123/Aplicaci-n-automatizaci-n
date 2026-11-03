"use client";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?pgd_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function redirectToLogin() {
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
  // Recarga completa intencional: descarta todo el estado del cliente (y permite la URL externa de cierre de Entra ID).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/login?returnTo=${returnTo}&expired=1`;
}

/** fetch para la API del portal: JSON, token CSRF y errores normalizados. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") headers.set("x-csrf-token", readCsrfToken());
  const res = await fetch(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, credentials: "same-origin" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && (err.code === "UNAUTHENTICATED" || err.code === "REAUTH_REQUIRED") && !err.details?.consent) redirectToLogin();
    if (res.status === 403 && err.code === "USER_NOT_ACTIVE") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sesión invalidada: recarga completa
      window.location.href = "/acceso-denegado?motivo=SUSPENDED";
    }
    throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? "No se pudo completar la operación.", err.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return "No fue posible comunicarse con el servidor. Verifique su conexión.";
  return "Ocurrió un error inesperado.";
}
