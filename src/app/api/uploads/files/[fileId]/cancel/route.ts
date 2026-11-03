import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { cancelFile } from "@/lib/services/uploads.service";

type Ctx = { params: Promise<{ fileId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await cancelFile(ctx, (await params).fileId));
});
