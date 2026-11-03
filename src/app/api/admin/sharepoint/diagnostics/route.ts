import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { sharePointDiagnostics } from "@/lib/services/admin-projects.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await sharePointDiagnostics(ctx));
});
