import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { verifyLocationStructure } from "@/lib/services/structure.service";

type Ctx = { params: Promise<{ locationId: string }> };

/** Verificación de estructura de SOLO LECTURA. */
export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await verifyLocationStructure(ctx, (await params).locationId));
});
