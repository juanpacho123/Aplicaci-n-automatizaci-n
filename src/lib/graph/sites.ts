import "server-only";
import { GraphClient, enc } from "./client";

/** Consultas de solo lectura de sitios y bibliotecas de SharePoint. */

export type SiteInfo = { id: string; displayName: string; webUrl: string; name?: string };
export type DriveInfo = { id: string; name: string; webUrl: string; driveType: string; description?: string };

/** Resuelve un sitio (o subsitio) por nombre de host y ruta: /sites/{host}:{path} */
export async function resolveSiteByPath(graph: GraphClient, hostname: string, sitePath: string): Promise<SiteInfo> {
  const path = sitePath.startsWith("/") ? sitePath : `/${sitePath}`;
  return graph.get<SiteInfo>(`/sites/${hostname}:${path.split("/").map(encodeURIComponent).join("/")}?$select=id,displayName,webUrl,name`);
}

export async function getSite(graph: GraphClient, siteId: string): Promise<SiteInfo> {
  return graph.get<SiteInfo>(`/sites/${enc(siteId)}?$select=id,displayName,webUrl,name`);
}

export async function listSiteDrives(graph: GraphClient, siteId: string): Promise<DriveInfo[]> {
  const res = await graph.get<{ value: DriveInfo[] }>(`/sites/${enc(siteId)}/drives?$select=id,name,webUrl,driveType,description`);
  return res.value;
}

export async function getDrive(graph: GraphClient, driveId: string): Promise<DriveInfo> {
  return graph.get<DriveInfo>(`/drives/${enc(driveId)}?$select=id,name,webUrl,driveType,description`);
}

/** Compara la URL de una biblioteca con la URL relativa configurada (insensible a mayúsculas/codificación). */
export function driveMatchesLibraryUrl(drive: DriveInfo, libraryServerRelativeUrl: string): boolean {
  const norm = (v: string) => {
    try {
      v = decodeURIComponent(v);
    } catch {
      /* noop */
    }
    return v.replace(/\/+$/, "").toLowerCase();
  };
  const path = norm(new URL(drive.webUrl).pathname);
  return path === norm(libraryServerRelativeUrl);
}
