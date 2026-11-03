import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { changeRole, ChangeRoleSchema } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ userId: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { roleKey } = await parseJson(req, ChangeRoleSchema);
  return json(await changeRole(ctx, (await params).userId, roleKey));
});
