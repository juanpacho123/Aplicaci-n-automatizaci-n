import { describe, expect, it } from "vitest";
import { canonicalFolderKey, fileExtension, formatBytes, sameName, stripNumbering, suggestAvailableName, validateFileCandidate, validateItemName } from "@/lib/validation/names";

describe("validateItemName (reglas de SharePoint)", () => {
  it("acepta nombres válidos y normaliza espacios", () => {
    expect(validateItemName("  Ensayos   de laboratorio ")).toEqual({ ok: true, value: "Ensayos de laboratorio" });
    expect(validateItemName("2.06 Seguimiento").ok).toBe(true);
    expect(validateItemName("Resultados mensuales (2026)").ok).toBe(true);
  });
  it("rechaza nombres vacíos", () => {
    expect(validateItemName("").ok).toBe(false);
    expect(validateItemName("    ").ok).toBe(false);
  });
  it.each(['a"b', "a*b", "a:b", "a<b", "a>b", "a?b", "a/b", "a\\b", "a|b", "tab\tname"])("rechaza caracteres no permitidos: %s", (n) => {
    expect(validateItemName(n).ok).toBe(false);
  });
  it("rechaza intentos de manipulación de rutas", () => {
    expect(validateItemName("..").ok).toBe(false);
    expect(validateItemName(".").ok).toBe(false);
    expect(validateItemName("../otro proyecto").ok).toBe(false);
    expect(validateItemName("carpeta.").ok).toBe(false);
  });
  it("rechaza nombres reservados", () => {
    for (const n of ["CON", "prn", "aux.txt", "COM1", "lpt9", ".lock", "desktop.ini", "~$temporal.docx", "x_vti_y"]) expect(validateItemName(n).ok).toBe(false);
  });
  it("limita la longitud", () => {
    expect(validateItemName("a".repeat(255)).ok).toBe(true);
    expect(validateItemName("a".repeat(256)).ok).toBe(false);
  });
});

describe("comparación de nombres", () => {
  it("no distingue mayúsculas (como SharePoint)", () => {
    expect(sameName("Planos", "PLANOS")).toBe(true);
    expect(sameName("Planos ", "planos")).toBe(true);
    expect(sameName("Planos", "Planos 2")).toBe(false);
  });
  it("sugiere un nombre libre conservando la extensión", () => {
    expect(suggestAvailableName("Informe.pdf", ["Informe.pdf"])).toBe("Informe (1).pdf");
    expect(suggestAvailableName("Informe.pdf", ["Informe.pdf", "informe (1).pdf"])).toBe("Informe (2).pdf");
    expect(suggestAvailableName("Informe (1).pdf", ["Informe (1).pdf"])).toBe("Informe (2).pdf");
    expect(suggestAvailableName("Carpeta", ["Carpeta"])).toBe("Carpeta (1)");
  });
  it("normaliza nombres de etapa sin tildes ni numeración", () => {
    expect(canonicalFolderKey("2. Ejecución")).toBe("2.ejecucion");
    expect(stripNumbering(canonicalFolderKey("2. Ejecución"))).toBe("ejecucion");
    expect(stripNumbering(canonicalFolderKey("2.06 Seguimiento"))).toBe("seguimiento");
  });
});

describe("validateFileCandidate", () => {
  const rules = { maxFileSizeMB: 10, allowedExtensions: ["pdf", "docx"] };
  it("acepta archivos permitidos", () => {
    expect(validateFileCandidate({ name: "acta.PDF", size: 1000 }, rules)).toEqual([]);
  });
  it("rechaza extensiones no permitidas, vacíos y tamaños excesivos", () => {
    expect(validateFileCandidate({ name: "programa.exe", size: 10 }, rules)[0]).toMatch(/no está permitida/);
    expect(validateFileCandidate({ name: "sinextension", size: 10 }, rules)[0]).toMatch(/extensión/);
    expect(validateFileCandidate({ name: "vacio.pdf", size: 0 }, rules)[0]).toMatch(/vacío/);
    expect(validateFileCandidate({ name: "grande.pdf", size: 11 * 1024 * 1024 }, rules)[0]).toMatch(/tamaño máximo/);
  });
  it("extrae extensiones y formatea tamaños", () => {
    expect(fileExtension("a.b.DOCX")).toBe("docx");
    expect(fileExtension(".oculto")).toBe("");
    expect(formatBytes(1536)).toMatch(/1,5 KB|1.5 KB/);
  });
});
