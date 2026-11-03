import { assertSameOrigin } from "@/lib/authz/guards";
import { requestInfo } from "@/lib/http/request-info";
import { json, parseJson, route } from "@/lib/http/route";
import { checkRateLimit, RateLimits } from "@/lib/security/rate-limit";
import { AdditionalInfoSchema, respondInfoRequest } from "@/lib/services/access-requests.service";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const info = requestInfo(req.headers);
  checkRateLimit(`access-respond:${info.ip ?? "anon"}`, RateLimits.publicForm);
  return json(await respondInfoRequest(await parseJson(req, AdditionalInfoSchema), info));
});
