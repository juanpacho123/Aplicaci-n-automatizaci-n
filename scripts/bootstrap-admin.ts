/**
 * Alta del PRIMER administrador (no hay registro libre en el portal).
 *
 * Uso: npm run admin:bootstrap -- --email admin@empresa.com --name "Nombre Apellido"
 * El administrador quedará ACTIVO y su identidad se vinculará (tid/oid) en su primer
 * inicio de sesión con Microsoft Entra ID usando ese correo (UPN o mail de su cuenta).
 */
import { scriptDb, stampEnvironment } from "./db";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const force = args.includes("--force");

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
  console.error('Uso: npm run admin:bootstrap -- --email admin@empresa.com --name "Nombre Apellido" [--force]');
  process.exit(1);
}

const db = scriptDb();
async function main() {
  await stampEnvironment(db, process.env.APP_MODE === "demo" ? "DEMO" : "PRODUCTION");
  const admins = await db.user.count({ where: { roleKey: "ADMIN", status: "ACTIVE" } });
  if (admins > 0 && !force) {
    console.error("Ya existe al menos un administrador activo. Use la interfaz o --force si es intencional.");
    process.exit(1);
  }
  const user = await db.user.upsert({
    where: { email: email! },
    create: { email: email!, fullName: name!, roleKey: "ADMIN", status: "ACTIVE", identityType: "MEMBER", authorizedAt: new Date(), statusReason: "Alta inicial por script" },
    update: { roleKey: "ADMIN", status: "ACTIVE", statusReason: "Promovido por script de alta inicial" },
  });
  await db.auditLog.create({
    data: { action: "USER_AUTHORIZED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: user.id, actorEmail: "script:bootstrap-admin", details: { email, role: "ADMIN" }, environment: process.env.APP_MODE === "demo" ? "DEMO" : "PRODUCTION" },
  });
  console.info(`Administrador ${email} activo. Inicie sesión con Microsoft para vincular su identidad.`);
}
main().finally(() => db.$disconnect());
