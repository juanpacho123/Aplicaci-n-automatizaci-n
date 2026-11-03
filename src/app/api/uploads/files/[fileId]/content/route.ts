import { authenticate } from "@/lib/authz/guards";
import { Errors } from "@/lib/http/errors";
import { json, route } from "@/lib/http/route";
import { getSettings } from "@/lib/services/settings.service";
import { uploadChunk } from "@/lib/services/uploads.service";

type Ctx = { params: Promise<{ fileId: string }> };

/**
 * Recibe un fragmento binario (Content-Range: bytes inicio-fin/total).
 * El tamaño se comprueba ANTES de leer el cuerpo para evitar abusos de memoria.
 */
export const PUT = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req, { rate: "uploadChunk" });
  const settings = await getSettings();
  const limit = Math.max(settings.uploads.chunkSizeKB * 1024, settings.uploads.simpleUploadMaxMB * 1024 * 1024);
  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) throw Errors.validation("Falta el encabezado Content-Length.");
  if (declared > limit) throw Errors.validation("El fragmento supera el tamaño permitido.");
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength !== declared) throw Errors.validation("El cuerpo recibido no coincide con Content-Length.");
  return json(await uploadChunk(ctx, (await params).fileId, req.headers.get("content-range"), body));
});
