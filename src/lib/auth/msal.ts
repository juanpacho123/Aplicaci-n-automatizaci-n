import "server-only";
import { readFileSync } from "node:fs";
import {
  ConfidentialClientApplication,
  DistributedCachePlugin,
  LogLevel,
  type Configuration,
  type ICacheClient,
  type IPartitionManager,
} from "@azure/msal-node";
import { env, entraConfigured } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { Errors } from "@/lib/http/errors";

/** Caché de tokens MSAL en PostgreSQL, cifrada con AES-256-GCM. */
class PostgresCacheClient implements ICacheClient {
  constructor(private readonly userId: string | null) {}
  async get(key: string): Promise<string> {
    const row = await db.tokenCache.findUnique({ where: { partitionKey: key } });
    if (!row) return "";
    try {
      return decrypt(row.payload, `msal:${key}`);
    } catch {
      return "";
    }
  }
  async set(key: string, value: string): Promise<string> {
    const payload = encrypt(value, `msal:${key}`);
    await db.tokenCache.upsert({
      where: { partitionKey: key },
      create: { partitionKey: key, payload, userId: this.userId },
      update: { payload, ...(this.userId ? { userId: this.userId } : {}) },
    });
    return value;
  }
}

class SessionPartitionManager implements IPartitionManager {
  constructor(private readonly key: string) {}
  async getKey() {
    return this.key;
  }
  async extractKey(account: { homeAccountId: string }) {
    return account.homeAccountId;
  }
}

let metadataCache: { authority?: string; cloud?: string } = {};

function credential(): Pick<Configuration["auth"], "clientSecret" | "clientCertificate"> {
  const e = env();
  if (e.ENTRA_CLIENT_CERT_THUMBPRINT && e.ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH) {
    return {
      clientCertificate: {
        thumbprintSha256: e.ENTRA_CLIENT_CERT_THUMBPRINT,
        privateKey: readFileSync(e.ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH, "utf8"),
      },
    };
  }
  return { clientSecret: e.ENTRA_CLIENT_SECRET };
}

export function authorityUrl() {
  const e = env();
  return `${e.ENTRA_AUTHORITY_HOST.replace(/\/$/, "")}/${e.ENTRA_TENANT_ID}`;
}

/**
 * Crea una instancia de ConfidentialClientApplication por solicitud, con la caché
 * particionada por cuenta (homeAccountId). Evita mezclar tokens entre usuarios.
 */
export function msalClient(partitionKey: string, userId: string | null = null): ConfidentialClientApplication {
  if (!entraConfigured()) throw Errors.configMissing("registro de aplicación de Microsoft Entra ID (tenant, client ID y credencial)");
  const e = env();
  const config: Configuration = {
    auth: {
      clientId: e.ENTRA_CLIENT_ID!,
      authority: authorityUrl(),
      ...credential(),
      ...(metadataCache.authority ? { authorityMetadata: metadataCache.authority } : {}),
      ...(metadataCache.cloud ? { cloudDiscoveryMetadata: metadataCache.cloud } : {}),
    },
    cache: { cachePlugin: new DistributedCachePlugin(new PostgresCacheClient(userId), new SessionPartitionManager(partitionKey)) },
    system: {
      loggerOptions: {
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
        loggerCallback: (level, message, containsPii) => {
          if (!containsPii && level <= LogLevel.Warning) console.warn("[msal]", message);
        },
      },
    },
  };
  return new ConfidentialClientApplication(config);
}

/** Precarga los metadatos del emisor para no repetir el descubrimiento en cada solicitud. */
export async function warmAuthorityMetadata() {
  if (metadataCache.authority) return;
  const e = env();
  try {
    const [oidc, cloud] = await Promise.all([
      fetch(`${authorityUrl()}/v2.0/.well-known/openid-configuration`).then((r) => (r.ok ? r.text() : undefined)),
      fetch(
        `${e.ENTRA_AUTHORITY_HOST}/common/discovery/instance?api-version=1.1&authorization_endpoint=${encodeURIComponent(`${authorityUrl()}/oauth2/v2.0/authorize`)}`,
      ).then((r) => (r.ok ? r.text() : undefined)),
    ]);
    metadataCache = { authority: oidc, cloud };
  } catch {
    metadataCache = {};
  }
}

export function loginScopes(): string[] {
  return Array.from(new Set(["openid", "profile", "email", "offline_access", "User.Read", ...env().GRAPH_DELEGATED_SCOPES]));
}

export function redirectUri() {
  return `${env().APP_URL.replace(/\/$/, "")}/api/auth/callback`;
}
