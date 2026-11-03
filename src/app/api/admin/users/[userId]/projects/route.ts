import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { SetProjectsSchema, setUserProjects } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ userId: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { projectIds } = await parseJson(req, SetProjectsSchema);
  return json(await setUserProjects(ctx, (await params).userId, projectIds));
});
