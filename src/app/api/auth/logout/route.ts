import { NextResponse, type NextRequest } from "next/server";
import { env, isDemoMode } from "@/lib/config/env";
import { cookieNames } from "@/lib/auth/cookies";
import { revokeSession, validateSessionToken } from "@/lib/auth/session";
import { clearAuthCookies } from "@/lib/auth/login.service";
import { authorityUrl } from "@/lib/auth/msal";
import { assertSameOrigin } from "@/lib/authz/guards";
import { db } from "@/lib/db/prisma";
import { requestInfo } from "@/lib/http/request-info";
import { errorResponse } from "@/lib/http/route";
import { Errors } from "@/lib/http/errors";
import { safeEqual } from "@/lib/security/crypto";
import { audit } from "@/lib/services/audit.service";

/** Cierra la sesión: revoca la sesión, elimina la caché de tokens y limpia cookies. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const session = await validateSessionToken(req.cookies.get(cookieNames().session)?.value);
    if (session) {
      const header = req.headers.get("x-csrf-token") ?? "";
      if (!header || !safeEqual(header, session.csrfToken)) throw Errors.csrf();
      await revokeSession(session.id, "logout");
      if (session.msalPartitionKey) await db.tokenCache.deleteMany({ where: { partitionKey: session.msalPartitionKey } });
      await audit({
        actor: { userId: session.user.id, email: session.user.email, name: session.user.fullName, company: session.user.company?.name, role: session.user.roleKey, request: requestInfo(req.headers) },
        action: "AUTH_LOGOUT",
        category: "AUTH",
        result: "SUCCESS",
      });
    }
    const logoutUrl =
      !isDemoMode() && session?.authMethod === "ENTRA_ID"
        ? `${authorityUrl()}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(`${env().APP_URL.replace(/\/$/, "")}/login`)}`
        : "/login";
    return clearAuthCookies(NextResponse.json({ redirect: logoutUrl }));
  } catch (err) {
    return errorResponse(err);
  }
}
