import "server-only";
import { Errors } from "@/lib/http/errors";

/**
 * Limitador de solicitudes de ventana deslizante en memoria.
 * Para despliegues con varias instancias, sustituir el almacén por uno compartido
 * (p. ej. Redis) manteniendo esta misma interfaz. Ver docs/seguridad.md.
 */
type Bucket = { hits: number[] };
const store = new Map<string, Bucket>();

export const RateLimits = {
  publicForm: { limit: 5, windowMs: 15 * 60_000 },
  login: { limit: 20, windowMs: 5 * 60_000 },
  mutation: { limit: 120, windowMs: 60_000 },
  uploadChunk: { limit: 1200, windowMs: 60_000 },
  read: { limit: 600, windowMs: 60_000 },
} as const;

export function checkRateLimit(key: string, rule: { limit: number; windowMs: number }, now = Date.now()) {
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < rule.windowMs);
  if (bucket.hits.length >= rule.limit) {
    const retryAfter = Math.ceil((rule.windowMs - (now - bucket.hits[0])) / 1000);
    store.set(key, bucket);
    throw Errors.rateLimited(Math.max(retryAfter, 1));
  }
  bucket.hits.push(now);
  store.set(key, bucket);
  if (store.size > 50_000) prune(now);
}

function prune(now: number) {
  for (const [k, b] of store) if (b.hits.every((t) => now - t > 60 * 60_000)) store.delete(k);
}

export function resetRateLimits() {
  store.clear();
}
