import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { suspendUser, StatusReasonSchema } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ userId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { reason } = await parseJson(req, StatusReasonSchema);
  return json(await suspendUser(ctx, (await params).userId, reason));
});
