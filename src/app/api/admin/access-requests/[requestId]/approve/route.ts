import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { approveAccessRequest, ApproveSchema } from "@/lib/services/access-requests.service";

type Ctx = { params: Promise<{ requestId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await approveAccessRequest(ctx, (await params).requestId, await parseJson(req, ApproveSchema)));
});
