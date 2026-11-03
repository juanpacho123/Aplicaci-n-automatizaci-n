/** Verificaciones de arranque del servidor (solo runtime Node.js). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/lib/config/env");
  env(); // Falla al arrancar si la configuración es inválida.
  const { ensureEnvironmentLock } = await import("@/lib/services/environment-lock");
  const environment = await ensureEnvironmentLock();
  console.info(`[portal] Entorno ${environment} verificado.`);
}
