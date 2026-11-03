import { assertSameOrigin } from "@/lib/authz/guards";
import { requestInfo } from "@/lib/http/request-info";
import { json, parseJson, route } from "@/lib/http/route";
import { checkRateLimit, RateLimits } from "@/lib/security/rate-limit";
import { PublicAccessRequestSchema, submitAccessRequest } from "@/lib/services/access-requests.service";

/** Solicitud pública de acceso. Queda pendiente; nunca autoriza automáticamente. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const info = requestInfo(req.headers);
  checkRateLimit(`access-request:${info.ip ?? "anon"}`, RateLimits.publicForm);
  const input = await parseJson(req, PublicAccessRequestSchema);
  const { trackingCode } = await submitAccessRequest(input, info);
  return json({ received: true, trackingCode }, { status: 202 });
});
