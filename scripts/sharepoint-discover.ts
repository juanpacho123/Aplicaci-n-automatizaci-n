/**
 * DESCUBRIMIENTO DE SHAREPOINT — SOLO LECTURA.
 *
 * Analiza la estructura documental existente antes de configurar el portal:
 *  1. Resuelve el sitio/subsitio a partir de SHAREPOINT_HOSTNAME + SHAREPOINT_SITE_PATH.
 *  2. Lista sus bibliotecas e identifica la configurada en SHAREPOINT_LIBRARY_URL.
 *  3. Recorre las carpetas hasta la profundidad indicada y detecta las etapas
 *     (Inicio / Ejecución / Cierre) y las subcarpetas iniciales esperadas.
 *  4. Escribe un informe en reports/ (excluido del repositorio) con los Site ID y Drive ID.
 *
 * No crea, modifica ni elimina NADA en SharePoint: solo emite solicitudes GET.
 * Se autentica con el flujo de código de dispositivo (identidad delegada del administrador).
 *
 * Uso:  npm run sp:discover -- --depth 3
 * Requiere: ENTRA_TENANT_ID, ENTRA_CLIENT_ID y «Permitir flujos de cliente público» en el registro
 *           de la aplicación (o un registro público separado). Ver docs/sharepoint.md.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { PublicClientApplication } from "@azure/msal-node";
import { DEFAULT_SETTINGS } from "../src/lib/validation/settings-schema";
import { matchesExpected, matchesStage } from "../src/lib/validation/structure-match";

const GRAPH = process.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0";
const args = process.argv.slice(2);
const depth = Number(args[args.indexOf("--depth") + 1]) || 3;
const maxFolders = Number(args[args.indexOf("--max") + 1]) || 2000;

function required(name: string) {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta la variable ${name}. Consulte .env.example y docs/sharepoint.md.`);
    process.exit(1);
  }
  return v;
}

const tenant = required("ENTRA_TENANT_ID");
const clientId = required("ENTRA_CLIENT_ID");
const hostname = required("SHAREPOINT_HOSTNAME");
const sitePath = required("SHAREPOINT_SITE_PATH");
const libraryUrl = process.env.SHAREPOINT_LIBRARY_URL ?? "";
const scopes = (process.env.GRAPH_DELEGATED_SCOPES ?? "Sites.Selected").split(/[\s,]+/).filter(Boolean);

type Item = { id: string; name: string; folder?: { childCount: number }; webUrl: string; createdBy?: { user?: { displayName?: string } }; lastModifiedDateTime?: string };

async function main() {
  const pca = new PublicClientApplication({ auth: { clientId, authority: `https://login.microsoftonline.com/${tenant}` } });
  const auth = await pca.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (r) => console.info(`\n${r.message}\n`),
  });
  if (!auth?.accessToken) throw new Error("No se obtuvo token.");
  console.info(`Autenticado como ${auth.account?.username}. Solo se realizarán consultas de lectura.\n`);

  const get = async <T>(path: string): Promise<T> => {
    const url = path.startsWith("https://") ? path : `${GRAPH}${path}`;
    if (new URL(url).origin !== new URL(GRAPH).origin) throw new Error("Origen no permitido");
    const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  const encodedPath = sitePath.split("/").map(encodeURIComponent).join("/");
  const site = await get<{ id: string; displayName: string; webUrl: string }>(`/sites/${hostname}:${encodedPath}?$select=id,displayName,webUrl`);
  console.info(`Sitio: ${site.displayName}\n  webUrl: ${site.webUrl}\n  SHAREPOINT_SITE_ID=${site.id}\n`);
  const drives = (await get<{ value: { id: string; name: string; webUrl: string; driveType: string }[] }>(`/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl,driveType`)).value;
  console.info("Bibliotecas del sitio:");
  for (const d of drives) console.info(`  - ${d.name}  (${d.webUrl})\n    Drive ID: ${d.id}`);
  const norm = (v: string) => decodeURIComponent(v).replace(/\/+$/, "").toLowerCase();
  const drive = drives.find((d) => libraryUrl && norm(new URL(d.webUrl).pathname) === norm(libraryUrl));
  if (!drive) {
    console.info("\nNo se identificó la biblioteca de SHAREPOINT_LIBRARY_URL. Revise el valor o elija el Drive ID de la lista.");
    return;
  }
  console.info(`\nBiblioteca configurada: ${drive.name}\n  SHAREPOINT_DRIVE_ID=${drive.id}\n`);

  const lines: string[] = [];
  let count = 0;
  const stages = DEFAULT_SETTINGS.structure.stages;
  const candidates: { path: string; id: string; stages: string[]; missing: string[] }[] = [];

  async function walk(itemId: string, path: string, level: number) {
    if (level > depth || count > maxFolders) return;
    let next: string | undefined = `/drives/${encodeURIComponent(drive!.id)}/items/${encodeURIComponent(itemId)}/children?$select=id,name,folder,webUrl,createdBy,lastModifiedDateTime&$top=999`;
    const folders: Item[] = [];
    while (next) {
      const page: { value: Item[]; "@odata.nextLink"?: string } = await get(next);
      folders.push(...page.value.filter((v) => v.folder));
      next = page["@odata.nextLink"];
    }
    const found = stages.filter((s) => folders.some((f) => matchesStage(f.name, s)));
    if (found.length >= 2) {
      const missing: string[] = [];
      for (const s of found) {
        const sf = folders.find((f) => matchesStage(f.name, s))!;
        const subs = (await get<{ value: Item[] }>(`/drives/${encodeURIComponent(drive!.id)}/items/${encodeURIComponent(sf.id)}/children?$select=id,name,folder&$top=999`)).value.filter((v) => v.folder);
        for (const e of s.expectedSubfolders) if (!subs.some((x) => matchesExpected(x.name, e))) missing.push(`${sf.name}/${e}`);
      }
      for (const s of stages) if (!found.includes(s)) missing.push(`(etapa) ${s.label}`);
      candidates.push({ path: path || "/", id: itemId, stages: found.map((s) => s.label), missing });
    }
    for (const f of folders.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))) {
      count++;
      lines.push(`${"  ".repeat(level)}- ${f.name}  (${f.folder?.childCount ?? 0} elem.)`);
      await walk(f.id, `${path}/${f.name}`, level + 1);
    }
  }
  await walk("root", "", 0);

  const report = [
    `# Estructura de SharePoint (solo lectura) — ${new Date().toISOString()}`,
    "",
    `- Sitio: ${site.displayName} — ${site.webUrl}`,
    `- SHAREPOINT_SITE_ID=${site.id}`,
    `- Biblioteca: ${drive.name} — ${drive.webUrl}`,
    `- SHAREPOINT_DRIVE_ID=${drive.id}`,
    `- Profundidad analizada: ${depth} · carpetas listadas: ${count}`,
    "",
    "## Carpetas que contienen etapas (candidatas a «ubicación de proyecto»)",
    "",
    ...(candidates.length
      ? candidates.map((c) => `- \`${c.path}\` — etapas: ${c.stages.join(", ")}${c.missing.length ? `\n  - Faltan: ${c.missing.join("; ")}` : ""}`)
      : ["(Ninguna detectada en la profundidad analizada; aumente --depth.)"]),
    "",
    "## Árbol de carpetas",
    "",
    ...lines,
  ].join("\n");
  await mkdir("reports", { recursive: true });
  const file = `reports/sharepoint-estructura-${Date.now()}.md`;
  await writeFile(file, report, "utf8");
  console.info(`Informe escrito en ${file}. Ninguna operación modificó SharePoint.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
