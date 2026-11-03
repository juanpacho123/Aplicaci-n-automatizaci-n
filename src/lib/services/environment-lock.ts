import "server-only";
import { db } from "@/lib/db/prisma";
import { dataEnvironment } from "@/lib/config/env";

const KEY = "system.environment";

/**
 * Sella la base de datos con el entorno en su primer uso y, a partir de ahí,
 * impide que una base de datos de DEMOSTRACIÓN se use en PRODUCCIÓN (y viceversa).
 */
export async function ensureEnvironmentLock(): Promise<"DEMO" | "PRODUCTION"> {
  const current = dataEnvironment();
  const row = await db.systemSetting.findUnique({ where: { key: KEY } });
  if (!row) {
    await db.systemSetting.create({ data: { key: KEY, value: current } });
    return current;
  }
  if (row.value !== current) {
    throw new Error(
      `La base de datos pertenece al entorno ${String(row.value)} y la aplicación se inició en modo ${current}. ` +
        "Use una base de datos distinta para cada entorno; los datos de demostración nunca deben mezclarse con datos reales.",
    );
  }
  return current;
}
