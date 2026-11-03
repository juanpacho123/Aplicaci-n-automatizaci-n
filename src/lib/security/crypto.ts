import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

/** Token aleatorio criptográficamente seguro, codificado en base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function key(): Buffer {
  return Buffer.from(env().TOKEN_ENCRYPTION_KEY, "base64");
}

/**
 * Cifrado autenticado AES-256-GCM. Formato: v1.<iv>.<tag>.<ciphertext> (base64url).
 * Se utiliza para la caché de tokens MSAL, las URL de sesiones de carga de Graph
 * y la cookie temporal del flujo OAuth.
 */
export function encrypt(plain: string, aad = "pgd"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, aad = "pgd"): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Formato cifrado no válido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
