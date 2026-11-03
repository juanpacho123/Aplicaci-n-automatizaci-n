/**
 * Contrato de la biblioteca documental. Dos implementaciones:
 *  - GraphStorageProvider: SharePoint Online vía Microsoft Graph (producción).
 *  - DemoStorageProvider:  almacenamiento local claramente identificado (modo demostración).
 */
export type DriveItem = {
  id: string;
  driveId: string;
  name: string;
  isFolder: boolean;
  size: number;
  mimeType: string | null;
  webUrl: string | null;
  eTag: string | null;
  parentId: string | null;
  /** Ruta legible del padre relativa a la raíz de la biblioteca (p. ej. "/Proyecto A/2. Ejecución"). */
  parentPath: string | null;
  childCount: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  createdBy: string | null;
  modifiedBy: string | null;
};

export type ChunkResult =
  | { done: false; nextExpectedRanges: string[] }
  | { done: true; item: DriveItem };

export type UploadSession = { uploadUrl: string; expiresAt: string | null };

export interface StorageProvider {
  readonly kind: "sharepoint" | "demo";
  getItem(driveId: string, itemId: string): Promise<DriveItem>;
  listChildren(driveId: string, itemId: string): Promise<DriveItem[]>;
  /** Ruta completa legible de un elemento (relativa a la raíz de la biblioteca). */
  fullPath(item: DriveItem): string;
  /** true si itemId es ancestorId o un descendiente suyo dentro de la misma biblioteca. */
  isWithin(driveId: string, ancestorId: string, itemId: string): Promise<boolean>;
  /** Cadena de ancestros desde stopAtId (incluido) hasta itemId (incluido). */
  ancestry(driveId: string, itemId: string, stopAtId: string, maxDepth: number): Promise<DriveItem[]>;
  createFolder(driveId: string, parentId: string, name: string): Promise<DriveItem>;
  renameItem(driveId: string, itemId: string, newName: string): Promise<DriveItem>;
  deleteItem(driveId: string, itemId: string): Promise<void>;
  uploadSmall(driveId: string, parentId: string, name: string, content: Uint8Array, replace: boolean): Promise<DriveItem>;
  createUploadSession(driveId: string, parentId: string, name: string, size: number, replace: boolean): Promise<UploadSession>;
  uploadChunk(session: string, start: number, end: number, total: number, chunk: Uint8Array): Promise<ChunkResult>;
  uploadSessionStatus(session: string): Promise<{ nextExpectedRanges: string[]; expiresAt: string | null }>;
  cancelUploadSession(session: string): Promise<void>;
}
