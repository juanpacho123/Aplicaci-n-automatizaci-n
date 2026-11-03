import "server-only";
import { GraphClient, GraphError, enc } from "@/lib/graph/client";
import type { ChunkResult, DriveItem, StorageProvider, UploadSession } from "./types";

type GraphDriveItem = {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  eTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  root?: object;
  parentReference?: { driveId?: string; id?: string; path?: string };
  createdBy?: { user?: { displayName?: string; email?: string } };
  lastModifiedBy?: { user?: { displayName?: string; email?: string } };
};

const SELECT = "$select=id,name,size,webUrl,eTag,createdDateTime,lastModifiedDateTime,folder,file,root,parentReference,createdBy,lastModifiedBy";

/** Convierte parentReference.path ("/drives/{id}/root:/A/B") en ruta legible ("/A/B"). */
export function readablePath(path: string | undefined): string | null {
  if (path === undefined) return null;
  const idx = path.indexOf("root:");
  if (idx < 0) return null;
  let rest = path.slice(idx + 5);
  try {
    rest = decodeURIComponent(rest);
  } catch {
    /* se conserva tal cual */
  }
  return rest === "" ? "/" : rest;
}

export function toDriveItem(g: GraphDriveItem, driveId: string): DriveItem {
  return {
    id: g.id,
    driveId: g.parentReference?.driveId ?? driveId,
    name: g.root ? "" : g.name,
    isFolder: Boolean(g.folder || g.root),
    size: g.size ?? 0,
    mimeType: g.file?.mimeType ?? null,
    webUrl: g.webUrl ?? null,
    eTag: g.eTag ?? null,
    parentId: g.root ? null : g.parentReference?.id ?? null,
    parentPath: g.root ? null : readablePath(g.parentReference?.path),
    childCount: g.folder?.childCount ?? null,
    createdAt: g.createdDateTime ?? null,
    modifiedAt: g.lastModifiedDateTime ?? null,
    createdBy: g.createdBy?.user?.displayName ?? g.createdBy?.user?.email ?? null,
    modifiedBy: g.lastModifiedBy?.user?.displayName ?? g.lastModifiedBy?.user?.email ?? null,
  };
}

function joinPath(parent: string | null, name: string) {
  if (parent === null) return "/";
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

/**
 * Proveedor real: SharePoint Online mediante Microsoft Graph, con token DELEGADO
 * del usuario autenticado. SharePoint aplica sus propios permisos en cada llamada.
 */
export class GraphStorageProvider implements StorageProvider {
  readonly kind = "sharepoint" as const;
  constructor(private readonly graph: GraphClient) {}

  async getItem(driveId: string, itemId: string): Promise<DriveItem> {
    const g = await this.graph.get<GraphDriveItem>(`/drives/${enc(driveId)}/items/${enc(itemId)}?${SELECT}`);
    return toDriveItem(g, driveId);
  }

  async listChildren(driveId: string, itemId: string): Promise<DriveItem[]> {
    const items: DriveItem[] = [];
    let next: string | undefined = `/drives/${enc(driveId)}/items/${enc(itemId)}/children?${SELECT}&$top=999`;
    let guard = 0;
    while (next && guard++ < 50) {
      const page: { value: GraphDriveItem[]; "@odata.nextLink"?: string } = await this.graph.get(next);
      items.push(...page.value.map((v) => toDriveItem(v, driveId)));
      next = page["@odata.nextLink"];
    }
    return items.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name, "es", { numeric: true }));
  }

  fullPath(item: DriveItem): string {
    return joinPath(item.parentPath, item.name);
  }

  async isWithin(driveId: string, ancestorId: string, itemId: string): Promise<boolean> {
    if (ancestorId === itemId) return true;
    const [item, ancestor] = await Promise.all([this.getItem(driveId, itemId), this.getItem(driveId, ancestorId)]);
    if (item.driveId !== ancestor.driveId) return false;
    const a = this.fullPath(ancestor).toLocaleLowerCase("es");
    const i = this.fullPath(item).toLocaleLowerCase("es");
    if (item.parentPath !== null && ancestor.parentPath !== null) return i === a || i.startsWith(a.endsWith("/") ? a : `${a}/`);
    if (ancestor.parentId === null && ancestor.parentPath === null) return true; // ancestro = raíz de la biblioteca
    // Respaldo: recorrido por identificadores de padre.
    let current: DriveItem | null = item;
    for (let depth = 0; current && depth < 40; depth++) {
      if (current.id === ancestorId) return true;
      if (!current.parentId) return false;
      current = await this.getItem(driveId, current.parentId);
    }
    return false;
  }

  async ancestry(driveId: string, itemId: string, stopAtId: string, maxDepth: number): Promise<DriveItem[]> {
    const chain: DriveItem[] = [];
    let current: DriveItem | null = await this.getItem(driveId, itemId);
    for (let depth = 0; current && depth <= maxDepth + 2; depth++) {
      chain.unshift(current);
      if (current.id === stopAtId) return chain;
      current = current.parentId ? await this.getItem(driveId, current.parentId) : null;
    }
    throw new GraphError("FORBIDDEN", "La carpeta no pertenece a la ubicación autorizada.", 403, 0, "outOfScope");
  }

  async createFolder(driveId: string, parentId: string, name: string): Promise<DriveItem> {
    const { data } = await this.graph.request<GraphDriveItem>(`/drives/${enc(driveId)}/items/${enc(parentId)}/children`, {
      method: "POST",
      body: { name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
    });
    return this.getItem(driveId, data.id);
  }

  async renameItem(driveId: string, itemId: string, newName: string): Promise<DriveItem> {
    const { data } = await this.graph.request<GraphDriveItem>(`/drives/${enc(driveId)}/items/${enc(itemId)}`, {
      method: "PATCH",
      body: { name: newName },
      headers: { "If-Match": "*" },
    });
    return toDriveItem(data, driveId);
  }

  async deleteItem(driveId: string, itemId: string): Promise<void> {
    // DELETE en SharePoint envía el elemento a la papelera de reciclaje del sitio.
    await this.graph.request(`/drives/${enc(driveId)}/items/${enc(itemId)}`, { method: "DELETE" });
  }

  async uploadSmall(driveId: string, parentId: string, name: string, content: Uint8Array, replace: boolean): Promise<DriveItem> {
    const behavior = replace ? "replace" : "fail";
    const { data } = await this.graph.request<GraphDriveItem>(
      `/drives/${enc(driveId)}/items/${enc(parentId)}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=${behavior}`,
      { method: "PUT", rawBody: content as unknown as BodyInit, headers: { "Content-Type": "application/octet-stream" }, retryable: false },
    );
    return toDriveItem(data, driveId);
  }

  async createUploadSession(driveId: string, parentId: string, name: string, _size: number, replace: boolean): Promise<UploadSession> {
    const { data } = await this.graph.request<{ uploadUrl: string; expirationDateTime?: string }>(
      `/drives/${enc(driveId)}/items/${enc(parentId)}:/${encodeURIComponent(name)}:/createUploadSession`,
      { method: "POST", body: { item: { "@microsoft.graph.conflictBehavior": replace ? "replace" : "fail", name } } },
    );
    return { uploadUrl: data.uploadUrl, expiresAt: data.expirationDateTime ?? null };
  }

  async uploadChunk(session: string, start: number, end: number, total: number, chunk: Uint8Array): Promise<ChunkResult> {
    const { status, data } = await this.graph.request<GraphDriveItem & { nextExpectedRanges?: string[] }>("", {
      method: "PUT",
      absoluteUrl: session,
      rawBody: chunk as unknown as BodyInit,
      headers: { "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${start}-${end}/${total}` },
      timeoutMs: 120_000,
    });
    if (status === 202) return { done: false, nextExpectedRanges: data.nextExpectedRanges ?? [] };
    const driveId = data.parentReference?.driveId ?? "";
    return { done: true, item: toDriveItem(data, driveId) };
  }

  async uploadSessionStatus(session: string) {
    const data = (await this.graph.request<{ nextExpectedRanges?: string[]; expirationDateTime?: string }>("", { method: "GET", absoluteUrl: session })).data;
    return { nextExpectedRanges: data.nextExpectedRanges ?? [], expiresAt: data.expirationDateTime ?? null };
  }

  async cancelUploadSession(session: string): Promise<void> {
    await this.graph.request("", { method: "DELETE", absoluteUrl: session, allowStatus: [404] });
  }
}
