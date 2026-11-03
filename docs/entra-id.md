# Configuración de Microsoft Entra ID

El portal usa **OpenID Connect (flujo de código de autorización con PKCE)** mediante MSAL Node, como **aplicación web confidencial de un solo inquilino**. Solo pueden iniciar sesión cuentas existentes en el directorio de la organización (miembros o invitados B2B); además, el portal solo admite identidades previamente autorizadas por el administrador.

## 1. Registrar la aplicación

Centro de administración de Microsoft Entra → **Identidad → Aplicaciones → Registros de aplicaciones → Nuevo registro**:

| Campo | Valor |
|---|---|
| Nombre | Portal de Gestión Documental |
| Tipos de cuenta admitidos | **Solo cuentas de este directorio organizativo** (un solo inquilino) |
| URI de redirección (Web) | `https://<dominio-del-portal>/api/auth/callback` |

Agregue también `http://localhost:3000/api/auth/callback` solo si va a probar en local contra el tenant.

Anote **Id. de directorio (inquilino)** → `ENTRA_TENANT_ID` y **Id. de aplicación (cliente)** → `ENTRA_CLIENT_ID`.

## 2. Credencial de la aplicación

**Recomendado: certificado.** En *Certificados y secretos → Certificados*, cargue el certificado público (`.cer`/`.pem`). En el servidor:

- `ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH`: ruta del archivo PEM con la clave privada (`-----BEGIN PRIVATE KEY-----`), legible solo por el proceso del portal.
- `ENTRA_CLIENT_CERT_THUMBPRINT`: huella **SHA-256** en hexadecimal:

```bash
openssl x509 -in certificado.pem -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':'
```

Alternativa: *Secretos de cliente → Nuevo secreto* → `ENTRA_CLIENT_SECRET`. Registre la fecha de vencimiento y rótelo antes de que expire.

## 3. Configuración de tokens

*Configuración de token → Agregar notificación opcional → Token de id.*: `email` y `acct`. El portal identifica al usuario por `tid` + `oid` (estables); el correo solo sirve para el primer vínculo con un registro ya autorizado.

## 4. Permisos de API (Microsoft Graph, **delegados**)

| Permiso | Uso | Consentimiento |
|---|---|---|
| `openid`, `profile`, `email`, `offline_access`, `User.Read` | Inicio de sesión y renovación de sesión | — |
| `Sites.Selected` | Leer/escribir **solo** en los sitios que se concedan explícitamente a la aplicación | Administrador |
| `User.Invite.All` | El administrador del portal envía invitaciones B2B | Administrador |
| `User.ReadBasic.All` | El administrador del portal localiza cuentas del directorio para vincularlas | — |

Pulse **Conceder consentimiento de administrador** para el inquilino. Configure `GRAPH_DELEGATED_SCOPES=Sites.Selected` y `GRAPH_ADMIN_SCOPES=User.Invite.All User.ReadBasic.All`.

No se usan permisos de **aplicación** (sin usuario): el portal nunca actúa con una cuenta compartida. Ver [permisos.md](permisos.md) y la concesión del sitio en [microsoft-graph.md](microsoft-graph.md).

## 5. Opciones recomendadas

- *Aplicaciones empresariales → Portal de Gestión Documental → Propiedades*: «¿Asignación necesaria?». Con **Sí**, solo los usuarios o grupos asignados pueden iniciar sesión (capa adicional). Si lo activa, asigne a cada invitado o a un grupo (p. ej. «Portal Documental – Contratistas»).
- **Acceso condicional**: exigir MFA a invitados y a administradores del portal.
- URL de cierre de sesión del canal frontal: `https://<dominio-del-portal>/login`.
- Solo para el script de descubrimiento (`npm run sp:discover`): *Autenticación → Permitir flujos de clientes públicos = Sí*, o use un registro separado de cliente público con los mismos permisos de lectura.

## 6. Comprobación

1. Configure las variables y arranque con `APP_MODE=production`.
2. En **Configuración → Conexión con Microsoft 365** todas las comprobaciones deben aparecer en verde.
3. Dé de alta al primer administrador (`npm run admin:bootstrap`) e inicie sesión: su identidad se vincula y queda auditada (`AUTH_IDENTITY_BOUND`).
