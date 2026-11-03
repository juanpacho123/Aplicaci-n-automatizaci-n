import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { adminDashboard } from "@/lib/services/dashboard.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await adminDashboard(ctx));
});
