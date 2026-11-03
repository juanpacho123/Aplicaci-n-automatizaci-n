import "server-only";
import { db } from "@/lib/db/prisma";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings, type SettingsSection } from "@/lib/validation/settings-schema";
import { audit, type Actor } from "./audit.service";
import type { Prisma } from "@/generated/prisma/client";

const SECTIONS = Object.keys(DEFAULT_SETTINGS) as SettingsSection[];
const TTL_MS = 15_000;
let cache: { at: number; value: Settings } | null = null;

/** Configuración vigente: valores guardados combinados con los predeterminados. */
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.systemSetting.findMany({ where: { key: { in: SECTIONS.map((s) => `settings.${s}`) } } });
  const merged: Record<string, unknown> = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    const section = row.key.replace("settings.", "") as SettingsSection;
    merged[section] = { ...(DEFAULT_SETTINGS[section] as object), ...(row.value as object) };
  }
  const parsed = SettingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  if (!parsed.success) console.error("[settings] Configuración guardada inválida; se usan valores predeterminados.", parsed.error.issues);
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function updateSettingsSection<S extends SettingsSection>(section: S, value: unknown, actor: Actor): Promise<Settings[S]> {
  const sectionSchema = SettingsSchema.shape[section];
  const parsed = sectionSchema.parse(value) as Settings[S];
  if (section === "structure") {
    const s = parsed as Settings["structure"];
    const keys = new Set(s.stages.map((st) => st.key));
    if (keys.size !== s.stages.length) throw new Error("Las claves de etapa deben ser únicas");
  }
  const before = (await getSettings())[section];
  await db.systemSetting.upsert({
    where: { key: `settings.${section}` },
    create: { key: `settings.${section}`, value: parsed as Prisma.InputJsonValue, updatedById: actor.userId },
    update: { value: parsed as Prisma.InputJsonValue, updatedById: actor.userId },
  });
  invalidateSettingsCache();
  await audit({ actor, action: "SETTINGS_UPDATED", category: "SETTINGS", result: "SUCCESS", targetType: "settings", targetId: section, details: { section, before, after: parsed } });
  return parsed;
}

/** Datos públicos de identidad corporativa (sin información sensible). */
export async function getBranding() {
  return (await getSettings()).branding;
}
