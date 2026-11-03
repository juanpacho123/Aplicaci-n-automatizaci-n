import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { env, isDemoMode } from "@/lib/config/env";
import { AppError, Errors } from "@/lib/http/errors";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/identity.service";
import { graphClientFor } from "@/lib/storage";
import { findDirectoryUserByEmail, sendB2BInvitation } from "@/lib/graph/directory";
import { Prisma, type RoleKey, type User } from "@/generated/prisma/client";
import { audit } from "./audit.service";
import { getSettings } from "./settings.service";

const phone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9+()\-\s.]*$/, "Teléfono no válido")
  .optional()
  .transform((v) => (v ? v : null));

export const CreateUserSchema = z.object({
  fullName: z.string().trim().min(3, "Ingrese el nombre completo").max(120),
  email: z.string().trim().email("Correo electrónico no válido").max(254).transform(normalizeEmail),
  phone,
  companyId: z.string().uuid().nullable().optional(),
  newCompanyName: z.string().trim().min(2).max(120).nullable().optional(),
  roleKey: z.enum(["ADMIN", "CONTRACTOR", "VIEWER"]),
  identityType: z.enum(["MEMBER", "GUEST"]),
  projectIds: z.array(z.string().uuid()).max(500).default([]),
  authorizeNow: z.boolean().default(true),
});

export const UpdateUserSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  phone,
  companyId: z.string().uuid().nullable().optional(),
  identityType: z.enum(["MEMBER", "GUEST"]).optional(),
});

export const SetProjectsSchema = z.object({ projectIds: z.array(z.string().uuid()).max(500) });
export const ChangeRoleSchema = z.object({ roleKey: z.enum(["ADMIN", "CONTRACTOR", "VIEWER"]) });
export const StatusReasonSchema = z.object({ reason: z.string().trim().min(3, "Indique el motivo").max(500) });

function snapshot(u: User) {
  return { email: u.email, fullName: u.fullName, roleKey: u.roleKey, status: u.status, companyId: u.companyId };
}

async function resolveCompany(ctx: AuthContext, companyId?: string | null, newCompanyName?: string | null, tx: Prisma.TransactionClient = db) {
  if (newCompanyName) {
    const existing = await tx.company.findFirst({ where: { name: { equals: newCompanyName, mode: "insensitive" } } });
    if (existing) return existing.id;
    const created = await tx.company.create({ data: { name: newCompanyName, createdById: ctx.user.id } });
    await audit({ actor: ctx.actor, action: "COMPANY_CREATED", category: "COMPANIES", result: "SUCCESS", targetType: "company", targetId: created.id, details: { name: created.name } }, tx);
    return created.id;
  }
  if (companyId) {
    const c = await tx.company.findUnique({ where: { id: companyId } });
    if (!c) throw Errors.validation("La empresa seleccionada no existe.");
    return c.id;
  }
  return null;
}

async function assertProjectsExist(projectIds: string[], tx: Prisma.TransactionClient = db) {
  if (projectIds.length === 0) return;
  const count = await tx.project.count({ where: { id: { in: projectIds } } });
  if (count !== new Set(projectIds).size) throw Errors.validation("Uno o más proyectos no existen.");
}

/** Registra un contratista (u otro rol). Nunca concede acceso sin una acción del administrador. */
export async function createUser(ctx: AuthContext, input: z.infer<typeof CreateUserSchema>) {
  await requirePermission(ctx, "users:manage");
  const projectIds = Array.from(new Set(input.projectIds));
  let user: User;
  try {
    user = await db.$transaction(async (tx) => {
      const companyId = await resolveCompany(ctx, input.companyId, input.newCompanyName, tx);
      await assertProjectsExist(projectIds, tx);
      const created = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          companyId,
          roleKey: input.roleKey,
          identityType: input.identityType,
          status: "PENDING_APPROVAL",
          createdById: ctx.user.id,
          projects: { create: projectIds.map((projectId) => ({ projectId, grantedById: ctx.user.id })) },
        },
      });
      await audit(
        {
          actor: ctx.actor,
          action: "USER_CREATED",
          category: "USERS",
          result: "SUCCESS",
          targetType: "user",
          targetId: created.id,
          details: { ...snapshot(created), projectIds, identityType: input.identityType },
        },
        tx,
      );
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("Ya existe un usuario registrado con ese correo electrónico.");
    throw e;
  }
  let authorization: { status: User["status"]; invitation: { ok: boolean; message: string; demo?: boolean } } | null = null;
  if (input.authorizeNow) {
    try {
      authorization = await authorizeUser(ctx, user.id);
    } catch (err) {
      // El registro se conserva como pendiente; se informa el resultado de la autorización.
      authorization = { status: "PENDING_APPROVAL", invitation: { ok: false, message: err instanceof AppError ? err.message : "No se pudo completar la autorización." } };
    }
  }
  return { user: await db.user.findUniqueOrThrow({ where: { id: user.id } }), authorization };
}

/**
 * Autoriza a un usuario registrado.
 * - Invitado externo (GUEST): envía una invitación B2B real mediante Microsoft Graph
 *   con la identidad del administrador → estado INVITATION_SENT. Se activa al
 *   aceptar la invitación e iniciar sesión con la identidad verificada.
 * - Cuenta de la organización (MEMBER): se busca en el directorio para fijar el oid → ACTIVE.
 * - Modo demostración: no se envían invitaciones (se informa) y la cuenta queda ACTIVA.
 */
export async function authorizeUser(ctx: AuthContext, userId: string) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  if (user.status === "ACTIVE") throw Errors.conflict("El usuario ya está activo.");
  if (user.status === "SUSPENDED") throw Errors.conflict("El usuario está suspendido; utilice «Reactivar».");
  const now = new Date();

  if (isDemoMode()) {
    await db.user.update({ where: { id: userId }, data: { status: "ACTIVE", authorizedById: ctx.user.id, authorizedAt: now, statusChangedAt: now, statusChangedById: ctx.user.id, statusReason: "Autorizado (modo demostración)" } });
    await audit({ actor: ctx.actor, action: "USER_AUTHORIZED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { mode: "demo", invitation: "not_sent_demo" } });
    return { status: "ACTIVE" as const, invitation: { ok: false, demo: true, message: "Modo demostración: no se envían invitaciones de Microsoft. La cuenta quedó activa para el inicio de sesión de demostración." } };
  }

  if (user.identityType === "GUEST") {
    const result = await inviteGuest(ctx, user);
    return { status: result.ok ? ("INVITATION_SENT" as const) : user.status, invitation: result };
  }

  // Cuenta de la organización: se intenta fijar la identidad estable (oid) desde el directorio.
  let directoryNote = "Se vinculará la identidad en el primer inicio de sesión.";
  const data: Prisma.UserUpdateInput = { status: "ACTIVE", authorizedBy: { connect: { id: ctx.user.id } }, authorizedAt: now, statusChangedAt: now, statusChangedById: ctx.user.id, statusReason: "Autorizado por el administrador" };
  try {
    const graph = graphClientFor(ctx, "admin");
    const found = await findDirectoryUserByEmail(graph, user.email);
    if (found) {
      const taken = await db.user.findFirst({ where: { entraTenantId: env().ENTRA_TENANT_ID, entraObjectId: found.id, NOT: { id: user.id } } });
      if (taken) throw Errors.conflict("La cuenta del directorio ya está asociada a otro usuario del portal.");
      Object.assign(data, { entraTenantId: env().ENTRA_TENANT_ID, entraObjectId: found.id, identityBoundAt: now, identityType: found.userType === "Guest" ? "GUEST" : "MEMBER" });
      directoryNote = `Identidad vinculada con la cuenta del directorio ${found.userPrincipalName}.`;
    } else {
      directoryNote = "No se encontró la cuenta en el directorio; se vinculará en el primer inicio de sesión si el correo coincide.";
    }
  } catch (err) {
    if (err instanceof AppError && err.code === "CONFLICT") throw err;
    directoryNote = `No fue posible consultar el directorio (${err instanceof AppError ? err.message : "error"}). Se vinculará en el primer inicio de sesión.`;
  }
  await db.user.update({ where: { id: userId }, data });
  await audit({ actor: ctx.actor, action: "USER_AUTHORIZED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { identityType: "MEMBER", note: directoryNote } });
  return { status: "ACTIVE" as const, invitation: { ok: true, message: directoryNote } };
}

async function inviteGuest(ctx: AuthContext, user: User) {
  const settings = await getSettings();
  const redirectUrl = `${env().APP_URL.replace(/\/$/, "")}/login`;
  try {
    const graph = graphClientFor(ctx, "admin");
    const res = await sendB2BInvitation(graph, {
      email: user.email,
      displayName: user.fullName,
      redirectUrl,
      sendMessage: settings.auth.sendInvitationEmail,
      message: settings.auth.invitationMessage,
    });
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.invitation.create({
        data: {
          userId: user.id,
          invitedById: ctx.user.id,
          invitedEmail: user.email,
          status: "SENT",
          redirectUrl,
          sendMessage: settings.auth.sendInvitationEmail,
          graphInvitationId: res.id,
          invitedUserObjectId: res.invitedUserId,
          invitedUserType: res.invitedUserType,
        },
      });
      const sameOid = res.invitedUserId
        ? await tx.user.findFirst({ where: { entraTenantId: env().ENTRA_TENANT_ID, entraObjectId: res.invitedUserId, NOT: { id: user.id } } })
        : null;
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: "INVITATION_SENT",
          identityType: "GUEST",
          authorizedById: ctx.user.id,
          authorizedAt: now,
          statusChangedAt: now,
          statusChangedById: ctx.user.id,
          statusReason: "Invitación B2B enviada",
          // El oid del invitado se fija ya: el inicio de sesión exigirá exactamente esa identidad.
          ...(res.invitedUserId && !sameOid ? { entraTenantId: env().ENTRA_TENANT_ID, entraObjectId: res.invitedUserId } : {}),
        },
      });
      await audit({ actor: ctx.actor, action: "INVITATION_SENT", category: "USERS", result: "SUCCESS", targetType: "user", targetId: user.id, details: { graphInvitationId: res.id, graphStatus: res.status, invitedUserType: res.invitedUserType, emailSent: settings.auth.sendInvitationEmail } }, tx);
    });
    return { ok: true, message: settings.auth.sendInvitationEmail ? "Invitación enviada por Microsoft al correo del contratista." : "Invitación registrada en Entra ID (sin correo automático).", graphStatus: res.status };
  } catch (err) {
    const appErr = err instanceof AppError ? err : new AppError("INTERNAL_ERROR", "Error al enviar la invitación.", 500);
    await db.invitation.create({
      data: { userId: user.id, invitedById: ctx.user.id, invitedEmail: user.email, status: "FAILED", redirectUrl, sendMessage: settings.auth.sendInvitationEmail, errorCode: appErr.code, errorMessage: appErr.message },
    });
    await audit({ actor: ctx.actor, action: "INVITATION_FAILED", category: "USERS", result: "FAILURE", targetType: "user", targetId: user.id, details: { code: appErr.code, message: appErr.message } });
    return { ok: false, message: appErr.message, code: appErr.code };
  }
}

export async function resendInvitation(ctx: AuthContext, userId: string) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  if (isDemoMode()) throw Errors.validation("Modo demostración: no se envían invitaciones de Microsoft.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  if (user.identityType !== "GUEST") throw Errors.validation("Solo los invitados externos reciben invitaciones B2B.");
  if (!["INVITATION_SENT", "PENDING_APPROVAL"].includes(user.status)) throw Errors.conflict("El usuario no está pendiente de invitación.");
  return inviteGuest(ctx, user);
}

export async function updateUser(ctx: AuthContext, userId: string, input: z.infer<typeof UpdateUserSchema>) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) throw Errors.notFound("El usuario no existe.");
  if (input.companyId) await resolveCompany(ctx, input.companyId);
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.identityType !== undefined && !before.identityBoundAt ? { identityType: input.identityType } : {}),
    },
  });
  await audit({ actor: ctx.actor, action: "USER_UPDATED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { before: snapshot(before), after: snapshot(updated) } });
  return updated;
}

async function activeAdminCount(excludeUserId?: string) {
  return db.user.count({ where: { roleKey: "ADMIN", status: "ACTIVE", ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) } });
}

export async function changeRole(ctx: AuthContext, userId: string, roleKey: RoleKey) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  if (user.roleKey === roleKey) return user;
  if (user.roleKey === "ADMIN" && (await activeAdminCount(userId)) === 0) throw Errors.conflict("Debe existir al menos un administrador activo.");
  if (user.id === ctx.user.id) throw Errors.conflict("No puede cambiar su propio rol.");
  const updated = await db.user.update({ where: { id: userId }, data: { roleKey } });
  // El cambio de privilegios invalida las sesiones existentes.
  await revokeAllUserSessions(userId, "role_changed");
  await audit({ actor: ctx.actor, action: "USER_ROLE_CHANGED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { from: user.roleKey, to: roleKey } });
  return updated;
}

export async function setUserProjects(ctx: AuthContext, userId: string, projectIds: string[]) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const ids = Array.from(new Set(projectIds));
  const user = await db.user.findUnique({ where: { id: userId }, include: { projects: true } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  await assertProjectsExist(ids);
  const current = new Set(user.projects.map((p) => p.projectId));
  const toAdd = ids.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !ids.includes(id));
  await db.$transaction([
    db.userProject.deleteMany({ where: { userId, projectId: { in: toRemove } } }),
    db.userProject.createMany({ data: toAdd.map((projectId) => ({ userId, projectId, grantedById: ctx.user.id })) }),
  ]);
  if (toAdd.length || toRemove.length) {
    await audit({ actor: ctx.actor, action: "USER_PROJECTS_CHANGED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { added: toAdd, removed: toRemove } });
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/**
 * Suspende el acceso: bloquea inicios de sesión y operaciones, invalida las sesiones
 * de la aplicación y elimina la caché de tokens. Conserva documentos e historial.
 */
export async function suspendUser(ctx: AuthContext, userId: string, reason: string) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  if (user.id === ctx.user.id) throw Errors.conflict("No puede suspender su propia cuenta.");
  if (user.status === "SUSPENDED") throw Errors.conflict("El usuario ya está suspendido.");
  if (user.roleKey === "ADMIN" && (await activeAdminCount(userId)) === 0) throw Errors.conflict("Debe existir al menos un administrador activo.");
  const now = new Date();
  await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED", statusChangedAt: now, statusChangedById: ctx.user.id, statusReason: reason } });
  const revoked = await revokeAllUserSessions(userId, "suspended");
  await audit({ actor: ctx.actor, action: "USER_SUSPENDED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { reason, previousStatus: user.status, sessionsRevoked: revoked } });
  return { status: "SUSPENDED" as const, sessionsRevoked: revoked };
}

export async function reactivateUser(ctx: AuthContext, userId: string, reason: string) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  if (user.status !== "SUSPENDED") throw Errors.conflict("Solo se pueden reactivar usuarios suspendidos.");
  const now = new Date();
  await db.user.update({ where: { id: userId }, data: { status: "ACTIVE", statusChangedAt: now, statusChangedById: ctx.user.id, statusReason: reason } });
  await audit({ actor: ctx.actor, action: "USER_REACTIVATED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { reason } });
  return { status: "ACTIVE" as const };
}

export async function rejectUser(ctx: AuthContext, userId: string, reason: string) {
  await requirePermission(ctx, "users:manage", { type: "user", id: userId });
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("El usuario no existe.");
  if (!["PENDING_APPROVAL", "INVITATION_SENT"].includes(user.status)) throw Errors.conflict("Solo se pueden rechazar registros pendientes.");
  await db.user.update({ where: { id: userId }, data: { status: "REJECTED", statusChangedAt: new Date(), statusChangedById: ctx.user.id, statusReason: reason } });
  await revokeAllUserSessions(userId, "rejected");
  await audit({ actor: ctx.actor, action: "USER_REJECTED", category: "USERS", result: "SUCCESS", targetType: "user", targetId: userId, details: { reason } });
  return { status: "REJECTED" as const };
}

// ───────────── Consultas ─────────────

export const UserFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["PENDING_APPROVAL", "INVITATION_SENT", "ACTIVE", "SUSPENDED", "REJECTED"]).optional(),
  role: z.enum(["ADMIN", "CONTRACTOR", "VIEWER"]).optional(),
  companyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export async function listUsers(ctx: AuthContext, filter: z.infer<typeof UserFilterSchema>) {
  await requirePermission(ctx, "users:manage");
  const where: Prisma.UserWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.role ? { roleKey: filter.role } : {}),
    ...(filter.companyId ? { companyId: filter.companyId } : {}),
    ...(filter.q
      ? { OR: [{ fullName: { contains: filter.q, mode: "insensitive" } }, { email: { contains: filter.q, mode: "insensitive" } }, { company: { name: { contains: filter.q, mode: "insensitive" } } }] }
      : {}),
  };
  const pageSize = 25;
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      skip: (filter.page - 1) * pageSize,
      take: pageSize,
      include: { company: true, role: true, _count: { select: { projects: true } } },
    }),
  ]);
  return { total, page: filter.page, pageSize, rows };
}

export async function getUserDetail(ctx: AuthContext, userId: string) {
  await requirePermission(ctx, "users:manage");
  if (!z.string().uuid().safeParse(userId).success) throw Errors.notFound("El usuario no existe.");
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      company: true,
      role: true,
      authorizedBy: { select: { fullName: true, email: true } },
      projects: { include: { project: true, grantedBy: { select: { fullName: true } } }, orderBy: { grantedAt: "desc" } },
      invitations: { orderBy: { createdAt: "desc" }, take: 10, include: { invitedBy: { select: { fullName: true } } } },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, lastSeenAt: true, authMethod: true } },
    },
  });
  if (!user) throw Errors.notFound("El usuario no existe.");
  const statusChangedBy = user.statusChangedById ? await db.user.findUnique({ where: { id: user.statusChangedById }, select: { fullName: true } }) : null;
  return { user, statusChangedBy };
}

// ───────────── Empresas ─────────────

export const CompanySchema = z.object({
  name: z.string().trim().min(2, "Ingrese el nombre de la empresa").max(120),
  taxId: z.string().trim().max(40).optional().transform((v) => v || null),
  contactEmail: z.union([z.string().trim().email(), z.literal("")]).optional().transform((v) => (v ? normalizeEmail(v) : null)),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
});

export async function listCompanies(ctx: AuthContext) {
  await requirePermission(ctx, "companies:manage");
  return db.company.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true, locations: true } } } });
}

export async function createCompany(ctx: AuthContext, input: z.infer<typeof CompanySchema>) {
  await requirePermission(ctx, "companies:manage");
  try {
    const c = await db.company.create({ data: { ...input, createdById: ctx.user.id } });
    await audit({ actor: ctx.actor, action: "COMPANY_CREATED", category: "COMPANIES", result: "SUCCESS", targetType: "company", targetId: c.id, details: input });
    return c;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("Ya existe una empresa con ese nombre.");
    throw e;
  }
}

export async function updateCompany(ctx: AuthContext, companyId: string, input: z.infer<typeof CompanySchema>) {
  await requirePermission(ctx, "companies:manage");
  try {
    const c = await db.company.update({ where: { id: companyId }, data: input });
    await audit({ actor: ctx.actor, action: "COMPANY_UPDATED", category: "COMPANIES", result: "SUCCESS", targetType: "company", targetId: c.id, details: input });
    return c;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("Ya existe una empresa con ese nombre.");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw Errors.notFound("La empresa no existe.");
    throw e;
  }
}
