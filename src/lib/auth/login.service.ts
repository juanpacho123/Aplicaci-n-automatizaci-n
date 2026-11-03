import "server-only";
import { NextResponse } from "next/server";
import { cookieNames } from "./cookies";
import { createSession } from "./session";
import { audit } from "@/lib/services/audit.service";
import { homePathFor, type RoleKey } from "@/lib/authz/policy";
import type { RequestInfo } from "@/lib/http/request-info";
import type { AuthMethod, User } from "@/generated/prisma/client";

/** Crea la sesión de aplicación y fija las cookies (httpOnly para la sesión). */
export async function establishSession(params: {
  user: User;
  authMethod: AuthMethod;
  msalPartitionKey?: string | null;
  request: RequestInfo;
  returnTo?: string | null;
  baseUrl: string;
  details?: Record<string, unknown>;
}) {
  const { token, csrfToken, maxAgeSeconds } = await createSession({
    userId: params.user.id,
    authMethod: params.authMethod,
    msalPartitionKey: params.msalPartitionKey,
    request: params.request,
  });
  await audit({
    actor: { userId: params.user.id, email: params.user.email, name: params.user.fullName, role: params.user.roleKey, request: params.request },
    action: "AUTH_LOGIN",
    category: "AUTH",
    result: "SUCCESS",
    targetType: "user",
    targetId: params.user.id,
    details: { method: params.authMethod, ...params.details },
  });
  const target = params.returnTo && params.returnTo !== "/" ? params.returnTo : homePathFor(params.user.roleKey as RoleKey);
  const names = cookieNames();
  const res = NextResponse.redirect(new URL(target, params.baseUrl), 303);
  const common = { path: "/", sameSite: "lax" as const, secure: names.secure, maxAge: maxAgeSeconds };
  res.cookies.set(names.session, token, { ...common, httpOnly: true });
  res.cookies.set(names.csrf, csrfToken, { ...common, httpOnly: false });
  res.cookies.set(names.oauth, "", { path: "/", maxAge: 0 });
  return res;
}

export function clearAuthCookies(res: NextResponse) {
  const names = cookieNames();
  for (const n of [names.session, names.csrf, names.oauth]) res.cookies.set(n, "", { path: "/", maxAge: 0, secure: names.secure });
  return res;
}
