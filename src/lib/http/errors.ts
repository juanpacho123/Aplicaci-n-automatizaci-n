/**
 * Errores de aplicación con código estable, estado HTTP y mensaje apto para el usuario.
 * Los detalles internos (respuestas de Graph, trazas) nunca se envían al cliente.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "REAUTH_REQUIRED"
  | "FORBIDDEN"
  | "USER_NOT_ACTIVE"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "NAME_ALREADY_EXISTS"
  | "CSRF_INVALID"
  | "RATE_LIMITED"
  | "CONFIGURATION_MISSING"
  | "SHAREPOINT_FORBIDDEN"
  | "SHAREPOINT_NOT_FOUND"
  | "SHAREPOINT_ERROR"
  | "SHAREPOINT_THROTTLED"
  | "UPLOAD_SESSION_EXPIRED"
  | "PAYLOAD_INVALID"
  | "PROTECTED_FOLDER"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED", "Debe iniciar sesión para continuar.", 401),
  reauth: () => new AppError("REAUTH_REQUIRED", "La sesión con Microsoft expiró. Vuelva a iniciar sesión.", 401),
  forbidden: (msg = "No tiene permisos para realizar esta operación.") => new AppError("FORBIDDEN", msg, 403),
  notActive: () => new AppError("USER_NOT_ACTIVE", "Su acceso no está activo. Contacte al administrador.", 403),
  notFound: (msg = "El recurso solicitado no existe.") => new AppError("NOT_FOUND", msg, 404),
  validation: (msg: string, details?: Record<string, unknown>) => new AppError("VALIDATION_ERROR", msg, 400, details),
  conflict: (msg: string, details?: Record<string, unknown>) => new AppError("CONFLICT", msg, 409, details),
  nameExists: (name: string) => new AppError("NAME_ALREADY_EXISTS", `Ya existe un elemento llamado «${name}» en esta ubicación.`, 409, { name }),
  csrf: () => new AppError("CSRF_INVALID", "La solicitud no pudo verificarse. Recargue la página e intente de nuevo.", 403),
  rateLimited: (retryAfter: number) => new AppError("RATE_LIMITED", "Demasiadas solicitudes. Espere un momento e intente de nuevo.", 429, { retryAfter }),
  configMissing: (what: string) => new AppError("CONFIGURATION_MISSING", `Falta completar la configuración administrativa: ${what}.`, 503, { what }),
  protectedFolder: () => new AppError("PROTECTED_FOLDER", "Esta carpeta forma parte de la estructura principal y no puede modificarse.", 403),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
