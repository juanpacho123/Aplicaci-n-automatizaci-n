import { authenticate } from "@/lib/authz/guards";
import { json, parseQuery, route } from "@/lib/http/route";
import { HistoryFilterSchema, listDocumentHistory } from "@/lib/services/history.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await listDocumentHistory(ctx, parseQuery(req, HistoryFilterSchema)));
});
