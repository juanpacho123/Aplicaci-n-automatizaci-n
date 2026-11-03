import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { SetLocationSchema, setProjectLocation } from "@/lib/services/admin-projects.service";

type Ctx = { params: Promise<{ projectId: string }> };

/** Asocia (o reemplaza) la ubicación de SharePoint del proyecto. No modifica SharePoint. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await setProjectLocation(ctx, (await params).projectId, await parseJson(req, SetLocationSchema)));
});
