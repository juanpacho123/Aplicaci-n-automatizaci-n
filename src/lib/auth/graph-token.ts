import "server-only";
import { InteractionRequiredAuthError } from "@azure/msal-node";
import { msalClient, warmAuthorityMetadata } from "./msal";
import { entraConfigured, env } from "@/lib/config/env";
import { AppError, Errors } from "@/lib/http/errors";

export type TokenScopeSet = "files" | "admin";

/**
 * Obtiene un token de acceso delegado para Microsoft Graph en nombre del usuario
 * de la sesión. El token permanece en el servidor; nunca se envía al navegador.
 */
export async function getDelegatedGraphToken(
  session: { msalPartitionKey: string | null; userId: string },
  scopeSet: TokenScopeSet = "files",
): Promise<string> {
  if (!entraConfigured()) throw Errors.configMissing("registro de aplicación de Microsoft Entra ID (ENTRA_TENANT_ID, ENTRA_CLIENT_ID y credencial)");
  if (!session.msalPartitionKey) throw Errors.reauth();
  await warmAuthorityMetadata();
  const client = msalClient(session.msalPartitionKey, session.userId);
  const account = await client.getTokenCache().getAccountByHomeId(session.msalPartitionKey);
  if (!account) throw Errors.reauth();
  const scopes = scopeSet === "admin" ? env().GRAPH_ADMIN_SCOPES : env().GRAPH_DELEGATED_SCOPES;
  try {
    const result = await client.acquireTokenSilent({ account, scopes });
    if (!result?.accessToken) throw Errors.reauth();
    return result.accessToken;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof InteractionRequiredAuthError) {
      if (scopeSet === "admin") {
        throw new AppError(
          "REAUTH_REQUIRED",
          "Se requiere conceder permisos administrativos de Microsoft Graph (User.Invite.All, User.ReadBasic.All). Un administrador global debe otorgar el consentimiento en Entra ID.",
          401,
          { consent: "admin" },
        );
      }
      throw Errors.reauth();
    }
    throw err;
  }
}
