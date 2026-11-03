import { execSync } from "node:child_process";

/** Aplica las migraciones a la base de datos de pruebas antes de la suite de integración. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://portal:portal_dev_pw@localhost:5432/portal_test";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
