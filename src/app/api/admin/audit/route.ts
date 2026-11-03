import { authenticate } from "@/lib/authz/guards";
import { json, parseQuery, route } from "@/lib/http/route";
import { AuditFilterSchema, listAuditLogs } from "@/lib/services/audit-query.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await listAuditLogs(ctx, parseQuery(req, AuditFilterSchema)));
});
