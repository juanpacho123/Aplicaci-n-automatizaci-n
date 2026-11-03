import "server-only";
import { AppError, type ErrorCode } from "@/lib/http/errors";

/**
 * Cliente mínimo de Microsoft Graph sobre fetch.
 * - Reintenta 429/503/504 respetando Retry-After (solo métodos idempotentes o marcados).
 * - Traduce errores de Graph a AppError con mensajes para el usuario.
 * - Nunca registra encabezados de autorización ni URLs de sesiones de carga.
 */

export type TokenProvider = () => Promise<string>;

export class GraphError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    public readonly graphStatus: number,
    public readonly graphCode?: string,
    public readonly retryAfter?: number,
  ) {
    super(code, message, status, { graphStatus, graphCode });
    this.name = "GraphError";
  }
}

export type GraphRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  /** Permite reintentar un método no idempotente (p. ej. POST de consulta). */
  retryable?: boolean;
  /** URL absoluta preautenticada (sesiones de carga): no se envía Authorization. */
  absoluteUrl?: string;
  timeoutMs?: number;
  /** Códigos HTTP que el llamador manejará (no se convierten en error). */
  allowStatus?: number[];
};

const RETRY_STATUS = new Set([429, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mapGraphError(status: number, graphCode?: string, message?: string): GraphError {
  const code = graphCode ?? "";
  if (status === 401) return new GraphError("REAUTH_REQUIRED", "La autorización con Microsoft expiró. Vuelva a iniciar sesión.", 401, status, code);
  if (status === 403)
    return new GraphError(
      "SHAREPOINT_FORBIDDEN",
      "SharePoint denegó el acceso a esta ubicación. Verifique que su cuenta tenga permisos sobre la carpeta.",
      403,
      status,
      code,
    );
  if (status === 404) return new GraphError("SHAREPOINT_NOT_FOUND", "La carpeta o el documento no existe en SharePoint o no es visible para su cuenta.", 404, status, code);
  if (status === 409 && /nameAlreadyExists/i.test(code + (message ?? "")))
    return new GraphError("NAME_ALREADY_EXISTS", "Ya existe un elemento con ese nombre en la ubicación de destino.", 409, status, code);
  if (status === 409 || status === 412) return new GraphError("CONFLICT", "El elemento fue modificado por otra operación. Actualice e intente de nuevo.", 409, status, code);
  if (status === 413) return new GraphError("PAYLOAD_INVALID", "El fragmento enviado excede el tamaño permitido por SharePoint.", 413, status, code);
  if (status === 429 || status === 503) return new GraphError("SHAREPOINT_THROTTLED", "SharePoint está limitando las solicitudes. Intente nuevamente en unos segundos.", 503, status, code);
  if (status === 507) return new GraphError("SHAREPOINT_ERROR", "El sitio de SharePoint no tiene espacio de almacenamiento suficiente.", 507, status, code);
  if (status === 400 && /invalidRequest|nameContainsInvalidCharacters|invalidName/i.test(code))
    return new GraphError("VALIDATION_ERROR", "SharePoint rechazó el nombre o la solicitud por contener valores no permitidos.", 400, status, code);
  return new GraphError("SHAREPOINT_ERROR", "SharePoint devolvió un error al procesar la operación.", 502, status, code);
}

export class GraphClient {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly maxRetries = 3,
  ) {}

  async request<T = unknown>(path: string, opts: GraphRequestOptions = {}): Promise<{ status: number; data: T; headers: Headers }> {
    const method = opts.method ?? "GET";
    let url: string;
    if (opts.absoluteUrl) url = opts.absoluteUrl;
    else if (/^https?:\/\//.test(path)) {
      // Enlaces de paginación: solo se acepta el mismo origen de Graph (el token nunca sale de él).
      if (new URL(path).origin !== new URL(this.baseUrl).origin) throw new GraphError("SHAREPOINT_ERROR", "Enlace de paginación no válido.", 502, 0, "badNextLink");
      url = path;
    } else url = `${this.baseUrl}${path}`;
    const idempotent = method === "GET" || method === "PUT" || method === "DELETE" || opts.retryable;
    let attempt = 0;

    for (;;) {
      const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
      if (!opts.absoluteUrl) headers.Authorization = `Bearer ${await this.getToken()}`;
      let body: BodyInit | undefined = opts.rawBody;
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      } catch (err) {
        clearTimeout(timer);
        if (idempotent && attempt < this.maxRetries) {
          attempt++;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        const reason = err instanceof Error && err.name === "AbortError" ? "tiempo de espera agotado" : "error de red";
        throw new GraphError("SHAREPOINT_ERROR", `No fue posible comunicarse con SharePoint (${reason}).`, 502, 0, "network");
      }
      clearTimeout(timer);

      if (RETRY_STATUS.has(res.status) && idempotent && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        attempt++;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 400 * 2 ** attempt);
        continue;
      }

      const text = res.status === 204 ? "" : await res.text();
      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (res.ok || opts.allowStatus?.includes(res.status)) return { status: res.status, data: data as T, headers: res.headers };

      const errObj = (data as { error?: { code?: string; message?: string; innerError?: { code?: string } } })?.error;
      const innerCode = errObj?.innerError?.code;
      throw mapGraphError(res.status, innerCode && innerCode !== errObj?.code ? `${errObj?.code}:${innerCode}` : errObj?.code, errObj?.message);
    }
  }

  get<T>(path: string, opts?: Omit<GraphRequestOptions, "method">) {
    return this.request<T>(path, { ...opts, method: "GET" }).then((r) => r.data);
  }
}

/** Codifica un id de Graph para usarlo en una ruta (los ids de drive contienen "!"). */
export const enc = (id: string) => encodeURIComponent(id);
