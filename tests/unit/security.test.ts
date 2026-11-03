import { describe, expect, it } from "vitest";
import { decrypt, encrypt, safeEqual, sha256 } from "@/lib/security/crypto";
import { openOAuthState, safeReturnTo, sealOAuthState } from "@/lib/auth/oauth-state";
import { candidateEmails, normalizeEmail } from "@/lib/auth/identity.service";
import { sanitizeDetails } from "@/lib/services/audit.service";
import { checkRateLimit, resetRateLimits } from "@/lib/security/rate-limit";

describe("cifrado autenticado", () => {
  it("cifra y descifra", () => {
    const c = encrypt("https://upload.example/sesion?token=abc", "ctx");
    expect(c).not.toContain("token=abc");
    expect(decrypt(c, "ctx")).toBe("https://upload.example/sesion?token=abc");
  });
  it("detecta manipulación o contexto incorrecto", () => {
    const c = encrypt("secreto", "a");
    expect(() => decrypt(c, "b")).toThrow();
    const parts = c.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decrypt(parts.join("."), "a")).toThrow();
  });
  it("hash y comparación en tiempo constante", () => {
    expect(sha256("x")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("flujo OAuth", () => {
  it("solo permite destinos internos tras el inicio de sesión", () => {
    expect(safeReturnTo("/cargar?proyecto=1")).toBe("/cargar?proyecto=1");
    for (const bad of ["https://malicioso.example", "//malicioso.example", "/\\malicioso.example", "javascript:alert(1)", "/api/auth/logout", null, ""]) {
      expect(safeReturnTo(bad as string | null)).toBe("/");
    }
  });
  it("sella el estado y expira", () => {
    const sealed = sealOAuthState({ state: "s", nonce: "n", codeVerifier: "v", returnTo: "/", createdAt: Date.now() });
    expect(openOAuthState(sealed)?.nonce).toBe("n");
    const old = sealOAuthState({ state: "s", nonce: "n", codeVerifier: "v", returnTo: "/", createdAt: Date.now() - 11 * 60_000 });
    expect(openOAuthState(old)).toBeNull();
    expect(openOAuthState("manipulado")).toBeNull();
  });
});

describe("reclamaciones de identidad", () => {
  it("extrae correos candidatos y descarta UPN de invitado (#EXT#)", () => {
    expect(candidateEmails({ email: "Juan@Constructora.example", preferred_username: "juan_constructora.example#EXT#@tenant.onmicrosoft.com", upn: 5 })).toEqual(["juan@constructora.example"]);
    expect(normalizeEmail("  A@B.EXAMPLE ")).toBe("a@b.example");
  });
});

describe("auditoría sin secretos", () => {
  it("omite tokens, secretos y URLs de sesión", () => {
    const out = sanitizeDetails({ accessToken: "x", nested: { client_secret: "y", uploadUrl: "z", ok: 1 }, list: [{ refreshToken: "r" }], authorization: "Bearer q" }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/"x"|"y"|"z"|"r"|Bearer/);
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
  });
});

describe("límite de solicitudes", () => {
  it("bloquea al superar el límite", () => {
    resetRateLimits();
    const rule = { limit: 3, windowMs: 1000 };
    checkRateLimit("k", rule, 0);
    checkRateLimit("k", rule, 1);
    checkRateLimit("k", rule, 2);
    expect(() => checkRateLimit("k", rule, 3)).toThrow(/Demasiadas/);
    expect(() => checkRateLimit("k", rule, 1500)).not.toThrow();
  });
});
