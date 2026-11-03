import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { resendInvitation } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ userId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await resendInvitation(ctx, (await params).userId));
});
