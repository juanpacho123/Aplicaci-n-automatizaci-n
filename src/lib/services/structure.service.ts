import "server-only";
import { db } from "@/lib/db/prisma";
import { AppError, Errors } from "@/lib/http/errors";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import { storageFor } from "@/lib/storage";
import type { DriveItem } from "@/lib/storage/types";
import { matchesExpected, matchesStage } from "@/lib/validation/structure-match";
import { audit } from "./audit.service";
import { getSettings } from "./settings.service";

export { matchesExpected, matchesStage };

export type StageReport = {
  key: string;
  label: string;
  status: "found" | "missing" | "ambiguous";
  folder: { id: string; name: string; path: string } | null;
  candidates: { id: string; name: string }[];
  expectedSubfolders: { name: string; found: boolean; actualName: string | null; id: string | null }[];
  otherSubfolders: { id: string; name: string }[];
};

/**
 * Verifica (SOLO LECTURA) la estructura real de una ubicación: carpetas de etapa y
 * subcarpetas iniciales esperadas. Registra el mapeo etapa → carpeta encontrada.
 * No crea, renombra ni elimina nada en SharePoint.
 */
export async function verifyLocationStructure(ctx: AuthContext, locationId: string): Promise<{ stages: StageReport[]; rootPath: string; verifiedAt: string }> {
  await requirePermission(ctx, "projects:manage", { type: "location", id: locationId });
  const location = await db.projectLocation.findUnique({ where: { id: locationId }, include: { project: true, stageFolders: true } });
  if (!location) throw Errors.notFound("La ubicación no existe.");
  const storage = storageFor(ctx);
  const settings = await getSettings();
  const root = await storage.getItem(location.driveId, location.rootItemId);
  const rootPath = storage.fullPath(root);
  const children = (await storage.listChildren(location.driveId, root.id)).filter((c) => c.isFolder);

  const reports: StageReport[] = [];
  for (const stage of [...settings.structure.stages].sort((a, b) => a.order - b.order)) {
    const candidates = children.filter((c) => matchesStage(c.name, stage));
    const previous = location.stageFolders.find((sf) => sf.stageKey === stage.key);
    let chosen: DriveItem | null = null;
    let status: StageReport["status"] = "missing";
    if (candidates.length === 1) {
      chosen = candidates[0];
      status = "found";
    } else if (candidates.length > 1) {
      chosen = candidates.find((c) => c.id === previous?.driveItemId) ?? null;
      status = chosen ? "found" : "ambiguous";
    }
    let expected: StageReport["expectedSubfolders"] = stage.expectedSubfolders.map((n) => ({ name: n, found: false, actualName: null, id: null }));
    let others: { id: string; name: string }[] = [];
    if (chosen) {
      const subs = (await storage.listChildren(location.driveId, chosen.id)).filter((c) => c.isFolder);
      expected = stage.expectedSubfolders.map((n) => {
        const m = subs.find((s) => matchesExpected(s.name, n));
        return { name: n, found: Boolean(m), actualName: m?.name ?? null, id: m?.id ?? null };
      });
      const matchedIds = new Set(expected.map((e) => e.id).filter(Boolean));
      others = subs.filter((s) => !matchedIds.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
    }
    reports.push({
      key: stage.key,
      label: stage.label,
      status,
      folder: chosen ? { id: chosen.id, name: chosen.name, path: storage.fullPath(chosen) } : null,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
      expectedSubfolders: expected,
      otherSubfolders: others,
    });
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const r of reports) {
      if (r.folder) {
        await tx.projectStageFolder.upsert({
          where: { locationId_stageKey: { locationId, stageKey: r.key } },
          create: { locationId, stageKey: r.key, driveItemId: r.folder.id, name: r.folder.name, path: r.folder.path, verifiedAt: now },
          update: { driveItemId: r.folder.id, name: r.folder.name, path: r.folder.path, verifiedAt: now },
        });
      } else if (r.status === "missing") {
        await tx.projectStageFolder.deleteMany({ where: { locationId, stageKey: r.key } });
      }
    }
    await tx.projectLocation.update({ where: { id: locationId }, data: { verifiedAt: now, rootPath, rootName: root.name, webUrl: root.webUrl } });
  });
  await audit({
    actor: ctx.actor,
    action: "PROJECT_STRUCTURE_VERIFIED",
    category: "PROJECTS",
    result: "SUCCESS",
    projectId: location.projectId,
    projectCode: location.project.code,
    targetType: "location",
    targetId: locationId,
    folderPath: rootPath,
    details: { stages: reports.map((r) => ({ key: r.key, status: r.status, missingSubfolders: r.expectedSubfolders.filter((e) => !e.found).map((e) => e.name) })) },
  });
  return { stages: reports, rootPath, verifiedAt: now.toISOString() };
}

/**
 * Operación CONTROLADA: crea una carpeta de etapa o una subcarpeta inicial faltante.
 * Requiere confirmación explícita del administrador con la ruta exacta mostrada.
 * Verifica de nuevo que no exista (no se duplican estructuras).
 */
export async function createMissingStructureFolder(ctx: AuthContext, input: { locationId: string; stageKey: string; subfolderName?: string | null; confirmPath: string }) {
  await requirePermission(ctx, "projects:manage", { type: "location", id: input.locationId });
  const location = await db.projectLocation.findUnique({ where: { id: input.locationId }, include: { project: true, stageFolders: true } });
  if (!location) throw Errors.notFound("La ubicación no existe.");
  const settings = await getSettings();
  const stage = settings.structure.stages.find((s) => s.key === input.stageKey);
  if (!stage) throw Errors.validation("Etapa no configurada.");
  const storage = storageFor(ctx);
  const root = await storage.getItem(location.driveId, location.rootItemId);
  const rootChildren = (await storage.listChildren(location.driveId, root.id)).filter((c) => c.isFolder);
  const stageCandidates = rootChildren.filter((c) => matchesStage(c.name, stage));

  let parent: DriveItem;
  let name: string;
  if (!input.subfolderName) {
    if (stageCandidates.length > 0) throw Errors.conflict(`La carpeta de la etapa «${stage.label}» ya existe («${stageCandidates[0].name}»). No se crean duplicados.`);
    parent = root;
    name = stage.folderNames[0];
  } else {
    const expected = stage.expectedSubfolders.find((n) => n === input.subfolderName);
    if (!expected) throw Errors.validation("La subcarpeta no forma parte de la estructura inicial configurada.");
    const mapped = location.stageFolders.find((sf) => sf.stageKey === stage.key);
    const stageFolder = stageCandidates.find((c) => c.id === mapped?.driveItemId) ?? (stageCandidates.length === 1 ? stageCandidates[0] : null);
    if (!stageFolder) throw Errors.conflict("Primero verifique la estructura: la carpeta de la etapa no está identificada.");
    const subs = (await storage.listChildren(location.driveId, stageFolder.id)).filter((c) => c.isFolder);
    const existing = subs.find((s) => matchesExpected(s.name, expected));
    if (existing) throw Errors.conflict(`La subcarpeta ya existe como «${existing.name}». No se crean duplicados.`);
    parent = stageFolder;
    name = expected;
  }
  const parentPath = storage.fullPath(parent);
  const targetPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
  if (input.confirmPath !== targetPath) throw Errors.validation("La ruta confirmada no coincide con la ruta de destino. Revise y confirme de nuevo.", { expected: targetPath });

  let created: DriveItem;
  try {
    created = await storage.createFolder(location.driveId, parent.id, name);
  } catch (err) {
    await audit({ actor: ctx.actor, action: "FOLDER_OPERATION_FAILED", category: "PROJECTS", result: "FAILURE", projectId: location.projectId, projectCode: location.project.code, folderPath: targetPath, details: { code: err instanceof AppError ? err.code : "INTERNAL" } });
    throw err;
  }
  await db.folderOperation.create({
    data: {
      type: "CREATE",
      result: "SUCCESS",
      userId: ctx.user.id,
      projectId: location.projectId,
      locationId: location.id,
      stageKey: stage.key,
      driveId: location.driveId,
      parentItemId: parent.id,
      driveItemId: created.id,
      name: created.name,
      path: storage.fullPath(created),
      environment: (await import("@/lib/config/env")).dataEnvironment(),
    },
  });
  await audit({
    actor: ctx.actor,
    action: "PROJECT_STAGE_FOLDER_CREATED",
    category: "PROJECTS",
    result: "SUCCESS",
    projectId: location.projectId,
    projectCode: location.project.code,
    targetType: "folder",
    targetId: created.id,
    folderPath: storage.fullPath(created),
    details: { stage: stage.key, subfolder: input.subfolderName ?? null, authorizedPath: targetPath },
  });
  return verifyLocationStructure(ctx, location.id);
}

/** Ruta exacta que se crearía (para presentarla al administrador antes de autorizar). */
export async function previewMissingFolderPath(ctx: AuthContext, input: { locationId: string; stageKey: string; subfolderName?: string | null }) {
  await requirePermission(ctx, "projects:manage");
  const location = await db.projectLocation.findUnique({ where: { id: input.locationId }, include: { stageFolders: true } });
  if (!location) throw Errors.notFound("La ubicación no existe.");
  const settings = await getSettings();
  const stage = settings.structure.stages.find((s) => s.key === input.stageKey);
  if (!stage) throw Errors.validation("Etapa no configurada.");
  const storage = storageFor(ctx);
  if (!input.subfolderName) {
    const root = await storage.getItem(location.driveId, location.rootItemId);
    const p = storage.fullPath(root);
    return { path: `${p === "/" ? "" : p}/${stage.folderNames[0]}` };
  }
  const mapped = location.stageFolders.find((sf) => sf.stageKey === stage.key);
  if (!mapped) throw Errors.conflict("La carpeta de la etapa no está identificada.");
  const stageFolder = await storage.getItem(location.driveId, mapped.driveItemId);
  return { path: `${storage.fullPath(stageFolder)}/${input.subfolderName}` };
}
