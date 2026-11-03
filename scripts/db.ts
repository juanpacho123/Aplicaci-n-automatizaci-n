import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/** Cliente Prisma para scripts de línea de comandos (fuera de Next.js). */
export function scriptDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definido.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

export async function stampEnvironment(db: PrismaClient, environment: "DEMO" | "PRODUCTION") {
  const row = await db.systemSetting.findUnique({ where: { key: "system.environment" } });
  if (!row) await db.systemSetting.create({ data: { key: "system.environment", value: environment } });
  else if (row.value !== environment) throw new Error(`La base de datos pertenece al entorno ${String(row.value)}; no se puede usar para ${environment}.`);
}
