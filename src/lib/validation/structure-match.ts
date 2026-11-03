import { canonicalFolderKey, stripNumbering } from "./names";
import type { StageDefinition } from "./settings-schema";

/** ¿El nombre de carpeta corresponde a la etapa? («2. Ejecución», «Ejecucion», «02. EJECUCIÓN»…) */
export function matchesStage(folderName: string, stage: Pick<StageDefinition, "folderNames" | "label">): boolean {
  const key = canonicalFolderKey(folderName);
  if (stage.folderNames.some((n) => canonicalFolderKey(n) === key)) return true;
  return stripNumbering(key) === stripNumbering(canonicalFolderKey(stage.label));
}

/** ¿El nombre real corresponde a la subcarpeta inicial esperada? (sin tildes ni mayúsculas) */
export function matchesExpected(actual: string, expected: string): boolean {
  const a = canonicalFolderKey(actual);
  const e = canonicalFolderKey(expected);
  if (a === e) return true;
  const sa = stripNumbering(a);
  return sa.length > 0 && sa === stripNumbering(e);
}
