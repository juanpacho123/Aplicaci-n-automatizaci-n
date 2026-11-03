import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { getUserDetail, updateUser, UpdateUserSchema } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ userId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await getUserDetail(ctx, (await params).userId));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await updateUser(ctx, (await params).userId, await parseJson(req, UpdateUserSchema)));
});
