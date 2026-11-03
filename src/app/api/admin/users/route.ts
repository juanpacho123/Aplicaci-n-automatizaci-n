import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, parseQuery, route } from "@/lib/http/route";
import { createUser, CreateUserSchema, listUsers, UserFilterSchema } from "@/lib/services/users.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await listUsers(ctx, parseQuery(req, UserFilterSchema)));
});

export const POST = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await createUser(ctx, await parseJson(req, CreateUserSchema)), { status: 201 });
});
