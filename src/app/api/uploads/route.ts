import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { createUploadOperation, CreateOperationSchema } from "@/lib/services/uploads.service";

export const POST = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await createUploadOperation(ctx, await parseJson(req, CreateOperationSchema)), { status: 201 });
});
