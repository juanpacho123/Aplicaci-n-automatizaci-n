import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { operationDetail } from "@/lib/services/history.service";

type Ctx = { params: Promise<{ operationId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await operationDetail(ctx, (await params).operationId));
});
