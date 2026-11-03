import { authenticate } from "@/lib/authz/guards";
import { json, parseQuery, route } from "@/lib/http/route";
import { FolderOpsFilterSchema, listFolderOperations } from "@/lib/services/history.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await listFolderOperations(ctx, parseQuery(req, FolderOpsFilterSchema)));
});
