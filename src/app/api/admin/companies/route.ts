import { authenticate } from "@/lib/authz/guards";
import { json, parseJson, route } from "@/lib/http/route";
import { CompanySchema, createCompany, listCompanies } from "@/lib/services/users.service";

export const GET = route(async (req) => {
  const ctx = await authenticate(req);
  return json({ companies: await listCompanies(ctx) });
});

export const POST = route(async (req) => {
  const ctx = await authenticate(req);
  return json(await createCompany(ctx, await parseJson(req, CompanySchema)), { status: 201 });
});
