import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { createProject, listProjectsAdmin, ProjectSchema } from "@/lib/services/admin-projects.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json({ projects: await listProjectsAdmin(ctx, req.nextUrl.searchParams.get("q") ?? undefined) });
});

export const POST = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await createProject(ctx, await parseJson(req, ProjectSchema)), { status: 201 });
});
