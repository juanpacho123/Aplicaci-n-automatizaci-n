import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { browseLibrary } from "@/lib/services/admin-projects.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await browseLibrary(ctx, req.nextUrl.searchParams.get("itemId")));
});
