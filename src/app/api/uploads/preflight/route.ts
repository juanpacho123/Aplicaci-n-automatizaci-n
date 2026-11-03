import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { preflight, PreflightSchema } from "@/lib/services/uploads.service";

export const POST = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await preflight(ctx, await parseJson(req, PreflightSchema)));
});
