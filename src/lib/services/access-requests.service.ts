import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { Errors } from "@/lib/http/errors";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { normalizeEmail } from "@/lib/auth/identity.service";
import { requirePermission, type AuthContext } from "@/lib/authz/guards";
import type { RequestInfo } from "@/lib/http/request-info";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit.service";
import { createUser } from "./users.service";

export const PublicAccessRequestSchema = z.object({
  fullName: z.string().trim().min(3, "Ingrese su nombre completo").max(120),
  companyName: z.string().trim().min(2, "Ingrese el nombre de la empresa").max(120),
  email: z.string().trim().email("Correo electrónico no válido").max(254).transform(normalizeEmail),
  requestedProject: z.string().trim().min(2, "Indique el proyecto").max(200),
  justification: z.string().trim().max(2000).optional().transform((v) => v || null),
  /** Campo trampa anti-bots: debe llegar vacío. */
  website: z.string().max(0).optional(),
});

export const TrackingSchema = z.object({ code: z.string().trim().min(10).max(64) });
export const AdditionalInfoSchema = z.object({ code: z.string().trim().min(10).max(64), additionalInfo: z.string().trim().min(3).max(2000) });

/**
 * Registra una solicitud pública. Queda PENDIENTE: nunca concede acceso.
 * La respuesta es siempre la misma para no revelar si un correo ya está registrado.
 */
export async function submitAccessRequest(input: z.infer<typeof PublicAccessRequestSchema>, request: RequestInfo) {
  const code = randomToken(15);
  const open = await db.accessRequest.count({ where: { email: input.email, status: { in: ["PENDING", "INFO_REQUESTED"] } } });
  if (open >= 3) {
    // Se registra el intento, pero no se crean más solicitudes abiertas para el mismo correo.
    await audit({ actor: { userId: null, email: input.email, request }, action: "ACCESS_REQUEST_CREATED", category: "ACCESS_REQUESTS", result: "DENIED", details: { reason: "too_many_open_requests" } });
    return { trackingCode: null as string | null };
  }
  const req = await db.accessRequest.create({
    data: {
      fullName: input.fullName,
      companyName: input.companyName,
      email: input.email,
      requestedProject: input.requestedProject,
      justification: input.justification,
      trackingCodeHash: sha256(code),
      ipAddress: request.ip,
    },
  });
  await audit({ actor: { userId: null, email: input.email, name: input.fullName, company: input.companyName, request }, action: "ACCESS_REQUEST_CREATED", category: "ACCESS_REQUESTS", result: "SUCCESS", targetType: "access_request", targetId: req.id, details: { requestedProject: input.requestedProject } });
  return { trackingCode: code };
}

const STATUS_PUBLIC_TEXT: Record<string, string> = {
  PENDING: "Pendiente de revisión por el administrador.",
  INFO_REQUESTED: "El administrador solicitó información adicional.",
  APPROVED: "Aprobada. Revise su correo: recibirá (o ya recibió) la invitación de Microsoft para verificar su identidad.",
  REJECTED: "La solicitud no fue aprobada.",
};

/** Consulta pública mediante el código de seguimiento (no expone datos de otras solicitudes). */
export async function trackAccessRequest(code: string) {
  const req = await db.accessRequest.findUnique({ where: { trackingCodeHash: sha256(code) } });
  if (!req) throw Errors.notFound("No se encontró una solicitud con ese código.");
  return {
    status: req.status,
    statusText: STATUS_PUBLIC_TEXT[req.status],
    createdAt: req.createdAt.toISOString(),
    infoRequestedMessage: req.status === "INFO_REQUESTED" ? req.infoRequestedMessage : null,
    canRespond: req.status === "INFO_REQUESTED",
  };
}

export async function respondInfoRequest(input: z.infer<typeof AdditionalInfoSchema>, request: RequestInfo) {
  const req = await db.accessRequest.findUnique({ where: { trackingCodeHash: sha256(input.code) } });
  if (!req) throw Errors.notFound("No se encontró una solicitud con ese código.");
  if (req.status !== "INFO_REQUESTED") throw Errors.conflict("La solicitud no está esperando información adicional.");
  await db.accessRequest.update({
    where: { id: req.id },
    data: { status: "PENDING", additionalInfo: [req.additionalInfo, `[${new Date().toISOString()}] ${input.additionalInfo}`].filter(Boolean).join("\n\n") },
  });
  await audit({ actor: { userId: null, email: req.email, request }, action: "ACCESS_REQUEST_INFO_REQUESTED", category: "ACCESS_REQUESTS", result: "SUCCESS", targetType: "access_request", targetId: req.id, details: { responded: true } });
  return { status: "PENDING" };
}

// ───────────── Administración ─────────────

export const ApproveSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  companyId: z.string().uuid().nullable().optional(),
  newCompanyName: z.string().trim().min(2).max(120).nullable().optional(),
  roleKey: z.enum(["CONTRACTOR", "VIEWER"]),
  identityType: z.enum(["MEMBER", "GUEST"]),
  projectIds: z.array(z.string().uuid()).min(1, "Asigne al menos un proyecto").max(200),
  notes: z.string().trim().max(1000).optional(),
});
export const RejectSchema = z.object({ notes: z.string().trim().min(3, "Indique el motivo").max(1000) });
export const RequestInfoSchema = z.object({ message: z.string().trim().min(5, "Describa la información requerida").max(1000) });

export const RequestFilterSchema = z.object({
  status: z.enum(["PENDING", "INFO_REQUESTED", "APPROVED", "REJECTED"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function listAccessRequests(ctx: AuthContext, filter: z.infer<typeof RequestFilterSchema>) {
  await requirePermission(ctx, "requests:manage");
  const where: Prisma.AccessRequestWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q ? { OR: [{ fullName: { contains: filter.q, mode: "insensitive" } }, { email: { contains: filter.q, mode: "insensitive" } }, { companyName: { contains: filter.q, mode: "insensitive" } }] } : {}),
  };
  const pageSize = 25;
  const [total, rows] = await Promise.all([
    db.accessRequest.count({ where }),
    db.accessRequest.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (filter.page - 1) * pageSize, take: pageSize }),
  ]);
  const existing = await db.user.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { email: true, id: true, status: true } });
  const byEmail = new Map(existing.map((u) => [u.email, u]));
  return { total, page: filter.page, pageSize, rows: rows.map((r) => ({ ...r, trackingCodeHash: undefined, existingUser: byEmail.get(r.email) ?? null })) };
}

async function loadOpen(requestId: string) {
  if (!z.string().uuid().safeParse(requestId).success) throw Errors.notFound("La solicitud no existe.");
  const req = await db.accessRequest.findUnique({ where: { id: requestId } });
  if (!req) throw Errors.notFound("La solicitud no existe.");
  if (req.status === "APPROVED" || req.status === "REJECTED") throw Errors.conflict("La solicitud ya fue resuelta.");
  return req;
}

/** Aprobación explícita del administrador: registra al usuario, asigna proyectos y autoriza. */
export async function approveAccessRequest(ctx: AuthContext, requestId: string, input: z.infer<typeof ApproveSchema>) {
  await requirePermission(ctx, "requests:manage", { type: "access_request", id: requestId });
  const req = await loadOpen(requestId);
  const already = await db.user.findUnique({ where: { email: req.email } });
  if (already) throw Errors.conflict("Ya existe un usuario con ese correo. Gestione su acceso desde Contratistas.");
  const result = await createUser(ctx, {
    fullName: input.fullName,
    email: req.email,
    phone: null,
    companyId: input.companyId ?? null,
    newCompanyName: input.companyId ? null : input.newCompanyName ?? req.companyName,
    roleKey: input.roleKey,
    identityType: input.identityType,
    projectIds: input.projectIds,
    authorizeNow: true,
  });
  await db.accessRequest.update({
    where: { id: req.id },
    data: { status: "APPROVED", reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNotes: input.notes ?? null, resultingUserId: result.user.id },
  });
  await audit({ actor: ctx.actor, action: "ACCESS_REQUEST_APPROVED", category: "ACCESS_REQUESTS", result: "SUCCESS", targetType: "access_request", targetId: req.id, details: { userId: result.user.id, projectIds: input.projectIds, roleKey: input.roleKey } });
  return result;
}

export async function rejectAccessRequest(ctx: AuthContext, requestId: string, notes: string) {
  await requirePermission(ctx, "requests:manage", { type: "access_request", id: requestId });
  const req = await loadOpen(requestId);
  await db.accessRequest.update({ where: { id: req.id }, data: { status: "REJECTED", reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNotes: notes } });
  await audit({ actor: ctx.actor, action: "ACCESS_REQUEST_REJECTED", category: "ACCESS_REQUESTS", result: "SUCCESS", targetType: "access_request", targetId: req.id, details: { notes } });
  return { status: "REJECTED" };
}

export async function requestMoreInfo(ctx: AuthContext, requestId: string, message: string) {
  await requirePermission(ctx, "requests:manage", { type: "access_request", id: requestId });
  const req = await loadOpen(requestId);
  await db.accessRequest.update({ where: { id: req.id }, data: { status: "INFO_REQUESTED", infoRequestedMessage: message, reviewedById: ctx.user.id, reviewedAt: new Date() } });
  await audit({ actor: ctx.actor, action: "ACCESS_REQUEST_INFO_REQUESTED", category: "ACCESS_REQUESTS", result: "SUCCESS", targetType: "access_request", targetId: req.id, details: { message } });
  return { status: "INFO_REQUESTED" };
}
