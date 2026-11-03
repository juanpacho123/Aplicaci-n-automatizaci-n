import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { CompanySchema, updateCompany } from "@/lib/services/users.service";

type Ctx = { params: Promise<{ companyId: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  return json(await updateCompany(ctx, (await params).companyId, await parseJson(req, CompanySchema)));
});
