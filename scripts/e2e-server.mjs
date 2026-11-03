/**
 * Servidor para pruebas E2E: base de datos dedicada (portal_e2e), migraciones,
 * datos de demostración y `next start` (compilación de producción) en modo demo.
 */
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = {
  ...process.env,
  APP_MODE: "demo",
  APP_URL: "http://localhost:3100",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://portal:portal_dev_pw@localhost:5432/portal_e2e",
  SESSION_SECRET: randomBytes(48).toString("base64"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  DEMO_STORAGE_DIR: "./.demo-storage-e2e",
};

execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx tsx prisma/seed-demo.ts", { stdio: "inherit", env });
const server = spawn("npx", ["next", "start", "-p", "3100"], { stdio: "inherit", env });
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
