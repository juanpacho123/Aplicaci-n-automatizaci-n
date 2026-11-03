import { z } from "zod";
import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { browseFolder, createFolder } from "@/lib/services/folders.service";

type Ctx = { params: Promise<{ projectId: string }> };

/** Contenido de una carpeta del proyecto (por defecto, la raíz de la ubicación). */
export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { projectId } = await params;
  const itemId = req.nextUrl.searchParams.get("itemId");
  const locationId = req.nextUrl.searchParams.get("locationId");
  return json(await browseFolder(ctx, { projectId, itemId, locationId }));
});

const CreateSchema = z.object({ parentItemId: z.string().min(1).max(200), name: z.string().max(400), locationId: z.string().uuid().nullable().optional() });

/** CREAR NUEVA CARPETA en una ubicación autorizada. */
export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { projectId } = await params;
  const body = await parseJson(req, CreateSchema);
  return json(await createFolder(ctx, { projectId, ...body }), { status: 201 });
});
