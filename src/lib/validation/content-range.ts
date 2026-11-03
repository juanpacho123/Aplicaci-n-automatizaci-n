export class RangeError400 extends Error {}

/** Interpreta «Content-Range: bytes inicio-fin/total» con validación estricta. */
export function parseContentRangeHeader(header: string | null): { start: number; end: number; total: number } | null {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header ?? "");
  if (!m) return null;
  const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total) || start > end || end >= total) return null;
  return { start, end, total };
}

export const GRAPH_CHUNK_UNIT = 320 * 1024;

/** Reglas de Graph: fragmentos intermedios múltiplos de 320 KiB y no mayores que el configurado. */
export function chunkProblem(length: number, end: number, size: number, maxChunk: number): string | null {
  if (length > maxChunk) return "El fragmento supera el tamaño configurado.";
  if (end !== size - 1 && length % GRAPH_CHUNK_UNIT !== 0) return "Los fragmentos intermedios deben ser múltiplos de 320 KiB.";
  return null;
}
