import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { listAccessibleProjects } from "@/lib/services/projects.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json({ projects: await listAccessibleProjects(ctx) });
});
