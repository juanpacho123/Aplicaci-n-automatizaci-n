import { assertSameOrigin } from "@/lib/authz/guards";
import { requestInfo } from "@/lib/http/request-info";
import { json, parseJson, route } from "@/lib/http/route";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { trackAccessRequest, TrackingSchema } from "@/lib/services/access-requests.service";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  checkRateLimit(`access-status:${requestInfo(req.headers).ip ?? "anon"}`, { limit: 30, windowMs: 15 * 60_000 });
  const { code } = await parseJson(req, TrackingSchema);
  return json(await trackAccessRequest(code));
});
