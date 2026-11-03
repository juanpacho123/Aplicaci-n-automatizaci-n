/**
 * Datos de DEMOSTRACIÓN. Solo se ejecuta con APP_MODE=demo y sobre una base de datos
 * sellada como DEMO. Todos los nombres, empresas y correos son ficticios (dominio
 * reservado .example). Los archivos se escriben en DEMO_STORAGE_DIR, nunca en SharePoint.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { scriptDb, stampEnvironment } from "../scripts/db";

if (process.env.APP_MODE !== "demo") {
  console.error("Rechazado: el seed de demostración solo se ejecuta con APP_MODE=demo.");
  process.exit(1);
}

const db = scriptDb();
const DRIVE = "demo-drive";
const ROOT = "demo-root";
const storageDir = path.resolve(process.env.DEMO_STORAGE_DIR ?? "./.demo-storage");

const EJECUCION = [
  "2.01 Documentación contratista",
  "2.02 Reunión antes de la construcción",
  "2.03 Simulacro",
  "2.04 Compras",
  "2.05 Materiales, equipo y estudio",
  "2.06 Seguimiento",
  "2.07 Planos",
  "2.08 Plan de calidad",
];

async function folder(parentId: string | null, name: string, by = "Administrador (demo)") {
  const id = parentId === null ? ROOT : randomUUID();
  await db.demoDriveItem.create({ data: { id, driveId: DRIVE, parentId, name, nameLower: name.toLocaleLowerCase("es"), isFolder: true, createdByName: by } });
  return id;
}

async function file(parentId: string, name: string, content: string) {
  const id = randomUUID();
  const buf = Buffer.from(content, "utf8");
  await mkdir(path.join(storageDir, "files"), { recursive: true });
  await writeFile(path.join(storageDir, "files", id), buf);
  await db.demoDriveItem.create({ data: { id, driveId: DRIVE, parentId, name, nameLower: name.toLocaleLowerCase("es"), isFolder: false, size: BigInt(buf.length), mimeType: "text/plain", createdByName: "Administrador (demo)" } });
}

async function projectTree(rootName: string, opts: { omitQuality?: boolean; omitClosure?: boolean } = {}) {
  const root = await folder(ROOT, rootName);
  const inicio = await folder(root, "1. Inicio");
  await folder(inicio, "Acta de inicio");
  await folder(inicio, "Pólizas y garantías");
  await file(inicio, "Léame (demostración).txt", "Documento de demostración. No contiene información real.");
  const ejec = await folder(root, "2. Ejecución");
  const subs: Record<string, string> = {};
  for (const n of EJECUCION) if (!(opts.omitQuality && n.startsWith("2.08"))) subs[n] = await folder(ejec, n);
  await file(subs["2.06 Seguimiento"], "Informe semanal 01 (demostración).txt", "Documento de demostración. No contiene información real.");
  let cierre: string | null = null;
  if (!opts.omitClosure) {
    cierre = await folder(root, "3. Cierre");
    await folder(cierre, "Dossier");
    await folder(cierre, "Entrenamiento del personal");
  }
  return { root, inicio, ejec, cierre };
}

async function main() {
  await stampEnvironment(db, "DEMO");
  console.info("Limpiando datos de demostración anteriores…");
  await db.$transaction([
    db.uploadedFile.deleteMany(),
    db.uploadOperation.deleteMany(),
    db.folderOperation.deleteMany(),
    db.projectStageFolder.deleteMany(),
    db.projectLocation.deleteMany(),
    db.userProject.deleteMany(),
    db.invitation.deleteMany(),
    db.session.deleteMany(),
    db.tokenCache.deleteMany(),
    db.accessRequest.deleteMany(),
    db.user.deleteMany(),
    db.company.deleteMany(),
    db.project.deleteMany(),
    db.demoUploadSession.deleteMany(),
    db.demoDriveItem.deleteMany(),
  ]);
  await rm(storageDir, { recursive: true, force: true });

  console.info("Creando biblioteca de demostración…");
  await folder(null, "Proyectos de Inversión Operaciones (demostración)");
  const trees = {
    A: await projectTree("PI-2024-001 Ampliación planta de tratamiento"),
    B: await projectTree("PI-2024-002 Subestación eléctrica norte"),
    C: await projectTree("PI-2025-003 Mantenimiento de cubiertas", { omitQuality: true, omitClosure: true }),
    D: await projectTree("PI-2025-004 Red contra incendios"),
  };

  const admin = await db.user.create({
    data: { email: "admin@portal-demo.example", fullName: "Laura Gómez (demo)", roleKey: "ADMIN", status: "ACTIVE", identityType: "MEMBER", authorizedAt: new Date() },
  });
  const [abc, xyz, norte] = await Promise.all(
    ["Constructora ABC S.A.S. (demo)", "Ingeniería XYZ Ltda. (demo)", "Montajes del Norte (demo)"].map((name) => db.company.create({ data: { name, createdById: admin.id } })),
  );

  const projects = await Promise.all(
    [
      { code: "PI-2024-001", name: "Ampliación planta de tratamiento", t: trees.A },
      { code: "PI-2024-002", name: "Subestación eléctrica norte", t: trees.B },
      { code: "PI-2025-003", name: "Mantenimiento de cubiertas", t: trees.C },
      { code: "PI-2025-004", name: "Red contra incendios", t: trees.D },
    ].map(async (p) => {
      const project = await db.project.create({ data: { code: p.code, name: p.name, description: "Proyecto ficticio de demostración.", createdById: admin.id } });
      const root = await db.demoDriveItem.findUniqueOrThrow({ where: { id: p.t.root } });
      const loc = await db.projectLocation.create({
        data: { projectId: project.id, siteId: "demo-site", driveId: DRIVE, rootItemId: p.t.root, rootName: root.name, rootPath: `/${root.name}`, createdById: admin.id, verifiedAt: new Date() },
      });
      const stages = [
        { key: "inicio", id: p.t.inicio, name: "1. Inicio" },
        { key: "ejecucion", id: p.t.ejec, name: "2. Ejecución" },
        ...(p.t.cierre ? [{ key: "cierre", id: p.t.cierre, name: "3. Cierre" }] : []),
      ];
      for (const s of stages) await db.projectStageFolder.create({ data: { locationId: loc.id, stageKey: s.key, driveItemId: s.id, name: s.name, path: `/${root.name}/${s.name}` } });
      return project;
    }),
  );
  const [A, B, C, D] = projects;

  const mk = (data: { email: string; fullName: string; companyId: string | null; roleKey: "CONTRACTOR" | "VIEWER"; status: "ACTIVE" | "SUSPENDED" | "PENDING_APPROVAL" | "INVITATION_SENT"; projects: string[] }) =>
    db.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        companyId: data.companyId,
        roleKey: data.roleKey,
        status: data.status,
        identityType: "GUEST",
        authorizedById: data.status === "PENDING_APPROVAL" ? null : admin.id,
        authorizedAt: data.status === "PENDING_APPROVAL" ? null : new Date(),
        createdById: admin.id,
        statusReason: data.status === "SUSPENDED" ? "Contrato finalizado (demo)" : null,
        projects: { create: data.projects.map((projectId) => ({ projectId, grantedById: admin.id })) },
      },
    });

  await mk({ email: "documentos@constructoraabc.example", fullName: "Carlos Ruiz (demo)", companyId: abc.id, roleKey: "CONTRACTOR", status: "ACTIVE", projects: [A.id, B.id, C.id] });
  await mk({ email: "calidad@ingenieriaxyz.example", fullName: "Ana Torres (demo)", companyId: xyz.id, roleKey: "CONTRACTOR", status: "ACTIVE", projects: [B.id] });
  await mk({ email: "interventoria@portal-demo.example", fullName: "Pedro Díaz (demo)", companyId: null, roleKey: "VIEWER", status: "ACTIVE", projects: [A.id, D.id] });
  await mk({ email: "jefe.obra@montajesnorte.example", fullName: "Jorge Peña (demo)", companyId: norte.id, roleKey: "CONTRACTOR", status: "SUSPENDED", projects: [D.id] });
  await mk({ email: "compras@montajesnorte.example", fullName: "María López (demo)", companyId: norte.id, roleKey: "CONTRACTOR", status: "PENDING_APPROVAL", projects: [] });

  await db.accessRequest.create({
    data: {
      fullName: "Sofía Martínez (demo)",
      companyName: "Eléctricas del Valle (demo)",
      email: "sofia.martinez@electricasvalle.example",
      requestedProject: "PI-2024-002 Subestación eléctrica norte",
      justification: "Responsable de la documentación de calidad del frente eléctrico (solicitud ficticia).",
      trackingCodeHash: "demo-" + randomUUID(),
    },
  });

  console.info("Datos de demostración creados:");
  console.info(`  Proyectos: ${projects.map((p) => p.code).join(", ")}`);
  console.info("  Usuarios: 1 administrador, 2 contratistas activos, 1 consulta, 1 suspendido, 1 pendiente.");
  console.info(`  Almacenamiento local: ${storageDir}`);
  void D;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
