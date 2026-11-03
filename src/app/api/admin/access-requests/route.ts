import { authenticate } from "@/lib/authz/guards";
import { json, parseQuery, route } from "@/lib/http/route";
import { listAccessRequests, RequestFilterSchema } from "@/lib/services/access-requests.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await listAccessRequests(ctx, parseQuery(req, RequestFilterSchema)));
});
