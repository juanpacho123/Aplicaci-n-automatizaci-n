import { authenticate } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { projectDetail } from "@/lib/services/projects.service";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  const { projectId } = await params;
  return json(await projectDetail(ctx, projectId, req.nextUrl.searchParams.get("locationId")));
});
