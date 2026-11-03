import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
  return new PrismaClient({ adapter, log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

/** Cliente Prisma único por proceso (evita agotar conexiones con recarga en caliente). */
export const db: PrismaClient = globalForPrisma.__prisma ?? createClient();
if (env().NODE_ENV !== "production") globalForPrisma.__prisma = db;

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
