/**
 * Validación de nombres de carpetas y archivos según las restricciones de
 * SharePoint Online / OneDrive. Se ejecuta en el navegador (ayuda inmediata) y
 * SIEMPRE en el servidor (control efectivo).
 */

export const INVALID_CHARS = /["*:<>?/\\|\u0000-\u001F\u007F]/;
const RESERVED = new Set([
  ".lock", "con", "prn", "aux", "nul", "desktop.ini",
  ...Array.from({ length: 10 }, (_, i) => `com${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${i}`),
]);
export const MAX_NAME_LENGTH = 255;

export type NameCheck = { ok: true; value: string } | { ok: false; error: string };

export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function validateItemName(raw: string, kind: "folder" | "file" = "folder"): NameCheck {
  if (typeof raw !== "string") return { ok: false, error: "El nombre es obligatorio." };
  // Los caracteres de control se validan sobre la entrada original (antes de normalizar espacios).
  if (INVALID_CHARS.test(raw.trim())) return { ok: false, error: 'El nombre contiene caracteres no permitidos: " * : < > ? / \\ | o caracteres de control.' };
  const value = normalizeName(raw);
  const label = kind === "folder" ? "la carpeta" : "el archivo";
  if (!value) return { ok: false, error: `El nombre de ${label} es obligatorio.` };
  if (value.length > MAX_NAME_LENGTH) return { ok: false, error: `El nombre no puede superar ${MAX_NAME_LENGTH} caracteres.` };
  if (INVALID_CHARS.test(value)) return { ok: false, error: 'El nombre contiene caracteres no permitidos: " * : < > ? / \\ |' };
  if (value === "." || value === ".." || value.endsWith(".")) return { ok: false, error: "El nombre no puede terminar en punto." };
  if (value.startsWith("~$")) return { ok: false, error: "El nombre no puede comenzar con «~$»." };
  if (/_vti_/i.test(value)) return { ok: false, error: "El nombre no puede contener «_vti_»." };
  const base = value.toLowerCase().replace(/\.[^.]*$/, "");
  if (RESERVED.has(value.toLowerCase()) || RESERVED.has(base)) return { ok: false, error: "El nombre está reservado por el sistema." };
  return { ok: true, value };
}

/** Comparación de nombres como lo hace SharePoint: sin distinguir mayúsculas. */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase("es") === normalizeName(b).toLocaleLowerCase("es");
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : "";
}

export type FileRules = { maxFileSizeMB: number; allowedExtensions: string[] };

export function validateFileCandidate(file: { name: string; size: number }, rules: FileRules): string[] {
  const errors: string[] = [];
  const nameCheck = validateItemName(file.name, "file");
  if (!nameCheck.ok) errors.push(nameCheck.error);
  const ext = fileExtension(file.name);
  if (!ext) errors.push("El archivo no tiene extensión.");
  else if (!rules.allowedExtensions.includes(ext)) errors.push(`La extensión «.${ext}» no está permitida.`);
  if (!Number.isFinite(file.size) || file.size <= 0) errors.push("El archivo está vacío.");
  else if (file.size > rules.maxFileSizeMB * 1024 * 1024) errors.push(`El archivo supera el tamaño máximo de ${rules.maxFileSizeMB} MB.`);
  return errors;
}

/** Sugiere un nombre libre: «Informe (1).pdf», «Informe (2).pdf», … */
export function suggestAvailableName(name: string, existing: Iterable<string>): string {
  const taken = new Set(Array.from(existing, (n) => normalizeName(n).toLocaleLowerCase("es")));
  // Se conserva la extensión tal como la escribió el usuario (p. ej. «.PDF»).
  const ext = fileExtension(name) ? name.slice(name.lastIndexOf(".") + 1) : "";
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  const cleanStem = stem.replace(/ \(\d+\)$/, "");
  for (let i = 1; i < 1000; i++) {
    const candidate = ext ? `${cleanStem} (${i}).${ext}` : `${cleanStem} (${i})`;
    if (!taken.has(candidate.toLocaleLowerCase("es"))) return candidate;
  }
  return `${cleanStem} (${Date.now()})${ext ? "." + ext : ""}`;
}

/** Normalización para comparar nombres de etapas/carpetas esperadas (sin tildes ni numeración). */
export function canonicalFolderKey(name: string): string {
  return normalizeName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripNumbering(key: string): string {
  return key.replace(/^\d+(\.\d+)*\.?\s*[-–]?\s*/, "").trim();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("es-CO", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
