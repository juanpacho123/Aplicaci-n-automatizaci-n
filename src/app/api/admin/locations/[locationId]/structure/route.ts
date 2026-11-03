import { z } from "zod";
import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { createMissingStructureFolder, previewMissingFolderPath } from "@/lib/services/structure.service";

type Ctx = { params: Promise<{ locationId: string }> };
const Base = z.object({ stageKey: z.string().min(1).max(40), subfolderName: z.string().max(200).nullable().optional() });

/** Vista previa: ruta exacta que se crearía (para autorización del administrador). */
export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const input = Base.parse({ stageKey: req.nextUrl.searchParams.get("stageKey"), subfolderName: req.nextUrl.searchParams.get("subfolderName") });
  return json(await previewMissingFolderPath(ctx, { locationId: (await params).locationId, ...input }));
});

/** Creación CONTROLADA de una carpeta de estructura faltante (requiere confirmar la ruta). */
export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const body = await parseJson(req, Base.extend({ confirmPath: z.string().min(1).max(1000) }));
  return json(await createMissingStructureFolder(ctx, { locationId: (await params).locationId, ...body }));
});
