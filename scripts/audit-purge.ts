/**
 * Depuración de auditoría por RETENCIÓN (mantenimiento, ejecución manual o programada).
 * El trigger de la base de datos impide UPDATE/DELETE; este script habilita la depuración
 * solo dentro de su transacción (SET LOCAL app.audit_purge = 'on') y solo para registros
 * más antiguos que settings.audit.retentionDays. Deja constancia de la depuración.
 *
 * Uso: npm run audit:purge -- [--dry-run]
 */
import { scriptDb } from "./db";

const db = scriptDb();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const row = await db.systemSetting.findUnique({ where: { key: "settings.audit" } });
  const retentionDays = Number((row?.value as { retentionDays?: number } | null)?.retentionDays ?? 1825);
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const count = await db.auditLog.count({ where: { occurredAt: { lt: cutoff } } });
  console.info(`Retención: ${retentionDays} días · registros anteriores a ${cutoff.toISOString()}: ${count}`);
  if (dryRun || count === 0) return;
  const env = ((await db.systemSetting.findUnique({ where: { key: "system.environment" } }))?.value as string) === "DEMO" ? "DEMO" : "PRODUCTION";
  await db.$transaction([
    db.$executeRawUnsafe("SET LOCAL app.audit_purge = 'on'"),
    db.auditLog.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
    db.auditLog.create({ data: { action: "SETTINGS_UPDATED", category: "SETTINGS", result: "SUCCESS", actorEmail: "script:audit-purge", targetType: "audit_retention", details: { purged: count, cutoff: cutoff.toISOString(), retentionDays }, environment: env } }),
  ]);
  console.info(`Depurados ${count} registros.`);
}
main().finally(() => db.$disconnect());
