import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { navigationFor } from "@/lib/authz/policy";
import { isDemoMode } from "@/lib/config/env";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json({
    user: { id: ctx.user.id, fullName: ctx.user.fullName, email: ctx.user.email, role: ctx.role, company: ctx.user.company?.name ?? null },
    permissions: [...ctx.permissions],
    navigation: navigationFor(ctx.role),
    mode: isDemoMode() ? "demo" : "production",
  });
});
