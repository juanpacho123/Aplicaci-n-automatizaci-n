import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { fileStatus } from "@/lib/services/uploads.service";

type Ctx = { params: Promise<{ fileId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await fileStatus(ctx, (await params).fileId));
});
