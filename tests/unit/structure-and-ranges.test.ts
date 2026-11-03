import { describe, expect, it } from "vitest";
import { matchesExpected, matchesStage } from "@/lib/validation/structure-match";
import { chunkProblem, GRAPH_CHUNK_UNIT, parseContentRangeHeader } from "@/lib/validation/content-range";
import { DEFAULT_SETTINGS, SettingsSchema } from "@/lib/validation/settings-schema";

const [inicio, ejecucion, cierre] = DEFAULT_SETTINGS.structure.stages;

describe("identificación de etapas en carpetas reales", () => {
  it("reconoce variantes de nombre de etapa", () => {
    for (const n of ["2. Ejecución", "2. Ejecucion", "2 Ejecución", "02. EJECUCIÓN", "Ejecución"]) expect(matchesStage(n, ejecucion)).toBe(true);
    expect(matchesStage("1. Inicio", inicio)).toBe(true);
    expect(matchesStage("3. Cierre", cierre)).toBe(true);
  });
  it("no confunde etapas", () => {
    expect(matchesStage("1. Inicio", ejecucion)).toBe(false);
    expect(matchesStage("Documentos varios", cierre)).toBe(false);
  });
  it("reconoce subcarpetas esperadas sin tildes ni mayúsculas", () => {
    expect(matchesExpected("2.01 Documentacion Contratista", "2.01 Documentación contratista")).toBe(true);
    expect(matchesExpected("DOSSIER", "Dossier")).toBe(true);
    expect(matchesExpected("2.07 Planos", "2.06 Seguimiento")).toBe(false);
  });
});

describe("Content-Range y fragmentos", () => {
  it("interpreta rangos válidos", () => {
    expect(parseContentRangeHeader("bytes 0-99/100")).toEqual({ start: 0, end: 99, total: 100 });
  });
  it.each([null, "", "bytes 5-4/10", "bytes 0-10/10", "bytes -1-5/10", "items 0-1/2", "bytes 0-1/x"])("rechaza rangos inválidos: %s", (h) => {
    expect(parseContentRangeHeader(h as string | null)).toBeNull();
  });
  it("exige múltiplos de 320 KiB en fragmentos intermedios", () => {
    const max = GRAPH_CHUNK_UNIT * 16;
    expect(chunkProblem(GRAPH_CHUNK_UNIT * 16, GRAPH_CHUNK_UNIT * 16 - 1, 10 * max, max)).toBeNull();
    expect(chunkProblem(1000, 999, 10 * max, max)).toMatch(/320 KiB/);
    expect(chunkProblem(1000, 999, 1000, max)).toBeNull(); // último fragmento
    expect(chunkProblem(max + GRAPH_CHUNK_UNIT, 0, 10 * max, max)).toMatch(/supera/);
  });
});

describe("esquema de configuración", () => {
  it("los valores predeterminados son válidos", () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });
  it("rechaza fragmentos que no son múltiplos de 320 KiB", () => {
    const bad = { ...DEFAULT_SETTINGS, uploads: { ...DEFAULT_SETTINGS.uploads, chunkSizeKB: 1000 } };
    expect(SettingsSchema.safeParse(bad).success).toBe(false);
  });
  it("la estructura inicial contiene las ocho subcarpetas de Ejecución y las de Cierre", () => {
    expect(ejecucion.expectedSubfolders).toHaveLength(8);
    expect(cierre.expectedSubfolders).toEqual(["Dossier", "Entrenamiento del personal"]);
  });
});
