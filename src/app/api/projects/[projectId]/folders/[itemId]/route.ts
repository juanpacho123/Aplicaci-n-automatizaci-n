import { z } from "zod";
import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { deleteFolder, renameFolder } from "@/lib/services/folders.service";

type Ctx = { params: Promise<{ projectId: string; itemId: string }> };

/** Renombrar carpeta adicional (solo administrador). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { projectId, itemId } = await params;
  const body = await parseJson(req, z.object({ newName: z.string().max(400), locationId: z.string().uuid().nullable().optional() }));
  return json(await renameFolder(ctx, { projectId, itemId, ...body }));
});

/** Eliminar carpeta adicional (solo administrador, con confirmación por nombre). */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { projectId, itemId } = await params;
  const body = await parseJson(req, z.object({ confirmName: z.string().max(400), locationId: z.string().uuid().nullable().optional() }));
  return json(await deleteFolder(ctx, { projectId, itemId, ...body }));
});
