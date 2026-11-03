import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { rejectAccessRequest, RejectSchema } from "@/lib/services/access-requests.service";

type Ctx = { params: Promise<{ requestId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { notes } = await parseJson(req, RejectSchema);
  return json(await rejectAccessRequest(ctx, (await params).requestId, notes));
});
