import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/authz/guards";
import { json, route } from "@/lib/http/route";
import { Errors } from "@/lib/http/errors";
import { updateSettingsSection } from "@/lib/services/settings.service";

type Ctx = { params: Promise<{ section: string }> };
const Section = z.enum(["branding", "uploads", "structure", "auth", "audit"]);

export const PUT = route<Ctx>(async (req, { params }) => {
  const ctx = await authenticate(req);
  await requirePermission(ctx, "settings:manage");
  const parsed = Section.safeParse((await params).section);
  if (!parsed.success) throw Errors.notFound("Sección de configuración no válida.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.validation("JSON no válido.");
  }
  return json({ value: await updateSettingsSection(parsed.data, body, ctx.actor) });
});
