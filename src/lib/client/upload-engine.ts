"use client";
import { api, ApiError, readCsrfToken } from "./api";

/**
 * Motor de carga del navegador.
 * - Envía cada archivo por fragmentos a la API del portal (nunca directamente a Graph).
 * - Progreso real por bytes enviados (XMLHttpRequest.upload.onprogress).
 * - Reintentos controlados ante errores transitorios (red, 429, 5xx) con espera exponencial.
 * - Ante una interrupción de red espera a recuperar la conexión y resincroniza el desplazamiento.
 * - Un fallo en un archivo no detiene a los demás.
 */

export type ChunkResponse =
  | { done: false; bytesUploaded: number; nextExpectedRanges: string[] }
  | { done: true; item: { id: string; name: string; webUrl: string | null; size: number; path: string }; verifiedAt: string; operationStatus: string; storage: "demo" | "sharepoint" };

export type DoneResult = Extract<ChunkResponse, { done: true }>;

export type UploadCallbacks = {
  onProgress: (bytes: number) => void;
  onRetry: (attempt: number, reason: string) => void;
};

const TRANSIENT = new Set([0, 408, 429, 500, 502, 503, 504]);

class TransientError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Cancelado", "AbortError"));
    }, { once: true });
  });

function waitOnline(signal: AbortSignal) {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const on = () => {
      window.removeEventListener("online", on);
      resolve();
    };
    window.addEventListener("online", on);
    signal.addEventListener("abort", () => {
      window.removeEventListener("online", on);
      reject(new DOMException("Cancelado", "AbortError"));
    }, { once: true });
  });
}

function putChunk(fileId: string, blob: Blob, start: number, end: number, total: number, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<ChunkResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/uploads/files/${encodeURIComponent(fileId)}/content`);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("x-csrf-token", readCsrfToken());
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      let data: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } & Record<string, unknown> = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        /* respuesta no JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as unknown as ChunkResponse);
      const retryAfter = Number(xhr.getResponseHeader("Retry-After"));
      if (TRANSIENT.has(xhr.status) && data.error?.code !== "VALIDATION_ERROR") {
        return reject(new TransientError(data.error?.message ?? `Error temporal (${xhr.status})`, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined));
      }
      reject(new ApiError(xhr.status, data.error?.code ?? "ERROR", data.error?.message ?? "No se pudo cargar el fragmento.", data.error?.details));
    };
    xhr.onerror = () => reject(new TransientError("Se perdió la conexión con el servidor."));
    xhr.ontimeout = () => reject(new TransientError("Tiempo de espera agotado."));
    xhr.timeout = 180_000;
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException("Cancelado", "AbortError"));
    xhr.send(blob);
  });
}

async function resync(fileId: string): Promise<number | null> {
  try {
    const st = await api<{ status: string; bytesUploaded: number; nextExpectedRanges: string[] | null }>(`/api/uploads/files/${encodeURIComponent(fileId)}`);
    if (st.status !== "IN_PROGRESS") return null;
    const next = st.nextExpectedRanges?.[0];
    return next ? Number(next.split("-")[0]) : st.bytesUploaded;
  } catch {
    return null;
  }
}

export async function uploadFile(
  file: { fileId: string; blob: Blob; size: number },
  opts: { chunkSize: number; maxRetries: number; signal: AbortSignal } & UploadCallbacks,
): Promise<DoneResult> {
  const { fileId, blob, size } = file;
  let start = await api<{ strategy: "simple" | "session"; chunkSize: number }>(`/api/uploads/files/${encodeURIComponent(fileId)}/start`, { method: "POST" });
  let offset = 0;
  let attempt = 0;

  for (;;) {
    if (opts.signal.aborted) throw new DOMException("Cancelado", "AbortError");
    const chunkSize = start.strategy === "simple" ? size : start.chunkSize || opts.chunkSize;
    const end = Math.min(offset + chunkSize, size) - 1;
    try {
      const res = await putChunk(fileId, blob.slice(offset, end + 1), offset, end, size, opts.signal, (loaded) => opts.onProgress(offset + loaded));
      if (res.done) {
        opts.onProgress(size);
        return res;
      }
      offset = res.bytesUploaded;
      opts.onProgress(offset);
      attempt = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (err instanceof ApiError && err.code === "UPLOAD_SESSION_EXPIRED" && attempt < opts.maxRetries) {
        attempt++;
        opts.onRetry(attempt, "La sesión de carga expiró; se reinicia el archivo.");
        start = await api(`/api/uploads/files/${encodeURIComponent(fileId)}/start`, { method: "POST" });
        offset = 0;
        opts.onProgress(0);
        continue;
      }
      if (!(err instanceof TransientError) || attempt >= opts.maxRetries) throw err;
      attempt++;
      opts.onRetry(attempt, err.message);
      await waitOnline(opts.signal);
      await sleep(err.retryAfterMs ?? Math.min(1000 * 2 ** attempt, 15_000), opts.signal);
      if (start.strategy === "session") {
        const synced = await resync(fileId);
        if (synced !== null) offset = synced;
      } else offset = 0;
      opts.onProgress(offset);
    }
  }
}

/** Ejecuta tareas con concurrencia limitada; cada tarea gestiona sus propios errores. */
export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await worker(next);
  });
  await Promise.all(runners);
}
