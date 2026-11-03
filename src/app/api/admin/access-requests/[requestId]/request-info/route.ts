import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { requestMoreInfo, RequestInfoSchema } from "@/lib/services/access-requests.service";

type Ctx = { params: Promise<{ requestId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { message } = await parseJson(req, RequestInfoSchema);
  return json(await requestMoreInfo(ctx, (await params).requestId, message));
});
