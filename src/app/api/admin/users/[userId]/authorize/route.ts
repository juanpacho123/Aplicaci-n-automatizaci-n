import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { authorizeUser } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ userId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await authorizeUser(ctx, (await params).userId));
});
