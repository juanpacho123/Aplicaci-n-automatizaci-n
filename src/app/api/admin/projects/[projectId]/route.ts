import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { projectAdminDetail, ProjectSchema, updateProject } from "@/lib/services/admin-projects.service";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await projectAdminDetail(ctx, (await params).projectId));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await updateProject(ctx, (await params).projectId, await parseJson(req, ProjectSchema)));
});
