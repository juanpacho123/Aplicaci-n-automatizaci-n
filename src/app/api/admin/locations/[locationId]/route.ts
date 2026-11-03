import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { removeProjectLocation } from "@/lib/services/admin-projects.service";

type Ctx = { params: Promise<{ locationId: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await removeProjectLocation(ctx, (await params).locationId));
});
