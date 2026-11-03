import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, Errors, isAppError } from "./errors";
import { randomToken } from "@/lib/security/crypto";

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown; correlationId?: string } };

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (isAppError(err)) {
    const headers: Record<string, string> = {};
    if (err.code === "RATE_LIMITED" && typeof err.details?.retryAfter === "number") headers["Retry-After"] = String(err.details.retryAfter);
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status, headers });
  }
  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: fields[0]?.message ?? "Datos no válidos.", details: { fields } } },
      { status: 400 },
    );
  }
  const correlationId = randomToken(8);
  // Registro técnico en servidor; sin tokens ni secretos (solo mensaje y pila).
  console.error(`[api-error ${correlationId}]`, err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado. Si persiste, informe el código al administrador.", correlationId } },
    { status: 500 },
  );
}

/** Envuelve un manejador de ruta con gestión centralizada de errores. */
export function route<C = unknown>(handler: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      const res = await handler(req, ctx);
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.validation("El cuerpo de la solicitud no es JSON válido.");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (obj[k] = v));
  return schema.parse(obj);
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(serialize(data), init);
}

/** Convierte BigInt a number para JSON (tamaños de archivo < 2^53). */
export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

export { AppError };
