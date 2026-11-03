import "server-only";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { Errors, AppError } from "@/lib/http/errors";
import { Prisma, type DemoDriveItem } from "@/generated/prisma/client";
import type { ChunkResult, DriveItem, StorageProvider, UploadSession } from "./types";

export const DEMO_DRIVE_ID = "demo-drive";
export const DEMO_ROOT_ID = "demo-root";
const SESSION_PREFIX = "demo-session:";

function storageDir() {
  return path.resolve(env().DEMO_STORAGE_DIR);
}

function contentPath(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Errors.validation("Identificador no válido.");
  return path.join(storageDir(), "files", id);
}

function notFound() {
  return new AppError("SHAREPOINT_NOT_FOUND", "La carpeta o el documento no existe en el almacenamiento de demostración.", 404);
}

/**
 * MODO DEMOSTRACIÓN. Emula una biblioteca documental para probar la interfaz y los
 * flujos sin Microsoft 365. Nada de lo que se guarda aquí llega a SharePoint, y la
 * interfaz lo indica de forma permanente.
 */
export class DemoStorageProvider implements StorageProvider {
  readonly kind = "demo" as const;
  constructor(private readonly actorName: string) {}

  private async row(itemId: string): Promise<DemoDriveItem> {
    const r = await db.demoDriveItem.findUnique({ where: { id: itemId } });
    if (!r) throw notFound();
    return r;
  }

  private async pathOf(r: DemoDriveItem): Promise<string | null> {
    if (!r.parentId) return null;
    const names: string[] = [];
    let current = await db.demoDriveItem.findUnique({ where: { id: r.parentId } });
    for (let i = 0; current && i < 60; i++) {
      if (!current.parentId) break;
      names.unshift(current.name);
      current = await db.demoDriveItem.findUnique({ where: { id: current.parentId } });
    }
    return "/" + names.join("/");
  }

  private async map(r: DemoDriveItem): Promise<DriveItem> {
    const childCount = r.isFolder ? await db.demoDriveItem.count({ where: { parentId: r.id } }) : null;
    return {
      id: r.id,
      driveId: r.driveId,
      name: r.parentId ? r.name : "",
      isFolder: r.isFolder,
      size: Number(r.size),
      mimeType: r.mimeType,
      webUrl: null,
      eTag: `"${r.id}:${r.modifiedAt.getTime()}"`,
      parentId: r.parentId,
      parentPath: await this.pathOf(r),
      childCount,
      createdAt: r.createdAt.toISOString(),
      modifiedAt: r.modifiedAt.toISOString(),
      createdBy: r.createdByName,
      modifiedBy: r.createdByName,
    };
  }

  private assertDrive(driveId: string) {
    if (driveId !== DEMO_DRIVE_ID) throw notFound();
  }

  async getItem(driveId: string, itemId: string) {
    this.assertDrive(driveId);
    return this.map(await this.row(itemId));
  }

  async listChildren(driveId: string, itemId: string) {
    this.assertDrive(driveId);
    const parent = await this.row(itemId);
    if (!parent.isFolder) throw Errors.validation("El elemento no es una carpeta.");
    const rows = await db.demoDriveItem.findMany({ where: { parentId: itemId } });
    const items = await Promise.all(rows.map((r) => this.map(r)));
    return items.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name, "es", { numeric: true }));
  }

  fullPath(item: DriveItem) {
    if (item.parentPath === null) return "/";
    return item.parentPath === "/" ? `/${item.name}` : `${item.parentPath}/${item.name}`;
  }

  async isWithin(driveId: string, ancestorId: string, itemId: string) {
    this.assertDrive(driveId);
    let current: DemoDriveItem | null = await db.demoDriveItem.findUnique({ where: { id: itemId } });
    for (let i = 0; current && i < 60; i++) {
      if (current.id === ancestorId) return true;
      current = current.parentId ? await db.demoDriveItem.findUnique({ where: { id: current.parentId } }) : null;
    }
    return false;
  }

  async ancestry(driveId: string, itemId: string, stopAtId: string, maxDepth: number) {
    this.assertDrive(driveId);
    const chain: DriveItem[] = [];
    let current: DemoDriveItem | null = await this.row(itemId);
    for (let i = 0; current && i <= maxDepth + 2; i++) {
      chain.unshift(await this.map(current));
      if (current.id === stopAtId) return chain;
      current = current.parentId ? await db.demoDriveItem.findUnique({ where: { id: current.parentId } }) : null;
    }
    throw Errors.forbidden("La carpeta no pertenece a la ubicación autorizada.");
  }

  private async insert(parentId: string, name: string, isFolder: boolean, size = 0, mimeType: string | null = null, id: string = randomUUID()) {
    try {
      return await db.demoDriveItem.create({
        data: { id, driveId: DEMO_DRIVE_ID, parentId, name, nameLower: name.toLocaleLowerCase("es"), isFolder, size: BigInt(size), mimeType, createdByName: this.actorName },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.nameExists(name);
      throw e;
    }
  }

  async createFolder(driveId: string, parentId: string, name: string) {
    this.assertDrive(driveId);
    const parent = await this.row(parentId);
    if (!parent.isFolder) throw Errors.validation("El destino no es una carpeta.");
    return this.map(await this.insert(parentId, name, true));
  }

  async renameItem(driveId: string, itemId: string, newName: string) {
    this.assertDrive(driveId);
    try {
      const r = await db.demoDriveItem.update({ where: { id: itemId }, data: { name: newName, nameLower: newName.toLocaleLowerCase("es"), modifiedAt: new Date() } });
      return this.map(r);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.nameExists(newName);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw notFound();
      throw e;
    }
  }

  async deleteItem(driveId: string, itemId: string) {
    this.assertDrive(driveId);
    const ids: string[] = [];
    const queue = [itemId];
    while (queue.length) {
      const id = queue.shift()!;
      ids.push(id);
      const children = await db.demoDriveItem.findMany({ where: { parentId: id }, select: { id: true } });
      queue.push(...children.map((c) => c.id));
    }
    await db.demoDriveItem.deleteMany({ where: { id: { in: ids } } });
    await Promise.all(ids.map((id) => rm(contentPath(id), { force: true })));
  }

  private async writeFinal(parentId: string, name: string, size: number, replace: boolean, tmpFile: string | null, content?: Uint8Array): Promise<DriveItem> {
    const existing = await db.demoDriveItem.findFirst({ where: { parentId, nameLower: name.toLocaleLowerCase("es") } });
    if (existing && !replace) {
      if (tmpFile) await rm(tmpFile, { force: true });
      throw Errors.nameExists(name);
    }
    if (existing?.isFolder) throw Errors.nameExists(name);
    const id = existing?.id ?? randomUUID();
    await mkdir(path.dirname(contentPath(id)), { recursive: true });
    if (tmpFile) await rename(tmpFile, contentPath(id));
    else {
      const fh = await open(contentPath(id), "w");
      await fh.write(content ?? new Uint8Array());
      await fh.close();
    }
    if (existing) {
      const r = await db.demoDriveItem.update({ where: { id }, data: { size: BigInt(size), modifiedAt: new Date(), createdByName: this.actorName } });
      return this.map(r);
    }
    return this.map(await this.insert(parentId, name, false, size, null, id));
  }

  async uploadSmall(driveId: string, parentId: string, name: string, content: Uint8Array, replace: boolean) {
    this.assertDrive(driveId);
    await this.row(parentId);
    return this.writeFinal(parentId, name, content.byteLength, replace, null, content);
  }

  async createUploadSession(driveId: string, parentId: string, name: string, size: number, replace: boolean): Promise<UploadSession> {
    this.assertDrive(driveId);
    await this.row(parentId);
    const existing = await db.demoDriveItem.findFirst({ where: { parentId, nameLower: name.toLocaleLowerCase("es") } });
    if (existing && !replace) throw Errors.nameExists(name);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 3600_000);
    await db.demoUploadSession.create({ data: { id, driveId, parentId, name, size: BigInt(size), replace, createdByName: this.actorName, expiresAt } });
    return { uploadUrl: SESSION_PREFIX + id, expiresAt: expiresAt.toISOString() };
  }

  private async sessionRow(session: string) {
    if (!session.startsWith(SESSION_PREFIX)) throw Errors.validation("Sesión de carga no válida.");
    const s = await db.demoUploadSession.findUnique({ where: { id: session.slice(SESSION_PREFIX.length) } });
    if (!s || s.expiresAt < new Date()) throw new AppError("UPLOAD_SESSION_EXPIRED", "La sesión de carga expiró. Reinicie la carga del archivo.", 410);
    return s;
  }

  async uploadChunk(session: string, start: number, end: number, total: number, chunk: Uint8Array): Promise<ChunkResult> {
    const s = await this.sessionRow(session);
    const received = Number(s.received);
    if (start !== received || total !== Number(s.size) || end - start + 1 !== chunk.byteLength) {
      return { done: false, nextExpectedRanges: [`${received}-`] };
    }
    const tmp = path.join(storageDir(), "sessions", s.id);
    await mkdir(path.dirname(tmp), { recursive: true });
    const fh = await open(tmp, start === 0 ? "w" : "a");
    await fh.write(chunk);
    await fh.close();
    const now = end + 1;
    await db.demoUploadSession.update({ where: { id: s.id }, data: { received: BigInt(now) } });
    if (now < total) return { done: false, nextExpectedRanges: [`${now}-`] };
    const size = (await stat(tmp)).size;
    const actor = new DemoStorageProvider(s.createdByName);
    const item = await actor.writeFinal(s.parentId, s.name, size, s.replace, tmp);
    await db.demoUploadSession.delete({ where: { id: s.id } });
    return { done: true, item };
  }

  async uploadSessionStatus(session: string) {
    const s = await this.sessionRow(session);
    return { nextExpectedRanges: [`${Number(s.received)}-`], expiresAt: s.expiresAt.toISOString() };
  }

  async cancelUploadSession(session: string) {
    if (!session.startsWith(SESSION_PREFIX)) return;
    const id = session.slice(SESSION_PREFIX.length);
    await db.demoUploadSession.deleteMany({ where: { id } });
    await rm(path.join(storageDir(), "sessions", id), { force: true });
  }
}
