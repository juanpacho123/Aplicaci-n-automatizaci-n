import { authenticate, requirePermission } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { getSettings } from "@/lib/services/settings.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  await requirePermission(ctx, "settings:manage");
  return json({ settings: await getSettings() });
});
