# Microsoft Graph

## Modelo de autorización: delegado

Todas las operaciones sobre SharePoint se ejecutan con un **token delegado del usuario que las realiza**:

- SharePoint aplica sus permisos reales (el contratista solo puede escribir donde usted le concedió acceso).
- SharePoint registra al contratista como autor («Creado por») del archivo o carpeta.
- No existe una cuenta administrativa compartida que oculte la identidad de los contratistas.
- Los tokens se obtienen y renuevan en el servidor (MSAL Node) y se guardan cifrados; nunca llegan al navegador.

El permiso efectivo es la **intersección** del permiso concedido a la aplicación y los permisos del usuario en SharePoint.

### Por qué no permisos de aplicación

Un permiso de aplicación (`Sites.ReadWrite.All` de aplicación) permitiría al portal escribir en cualquier sitio sin usuario, perdería la autoría real y exigiría replicar todos los permisos en el portal. No es necesario para ninguna funcionalidad, por lo que **no se solicita**.

## Mínimo privilegio con `Sites.Selected` (delegado)

`Sites.Selected` delegado limita la aplicación a los sitios que se le concedan explícitamente. Tras el consentimiento de administrador (ver [entra-id.md](entra-id.md)), un administrador de SharePoint debe **conceder la aplicación sobre el sitio**:

**Opción A — PnP PowerShell** (administrador de SharePoint):

```powershell
Connect-PnPOnline -Url https://dac365.sharepoint.com/sites/OperacionesIngenierayMantenimiento -Interactive -ClientId <id-app-pnp>
Grant-PnPAzureADAppSitePermission -AppId <ENTRA_CLIENT_ID> -DisplayName "Portal de Gestión Documental" -Site https://dac365.sharepoint.com/sites/OperacionesIngenierayMantenimiento -Permissions Write
```

**Opción B — Microsoft Graph** (con una identidad que tenga `Sites.FullControl.All`):

```http
POST https://graph.microsoft.com/v1.0/sites/{SHAREPOINT_SITE_ID}/permissions
Content-Type: application/json

{ "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "<ENTRA_CLIENT_ID>", "displayName": "Portal de Gestión Documental" } }] }
```

La concesión se hace sobre la **colección de sitios** `OperacionesIngenierayMantenimiento`; la biblioteca está en el **subsitio** `IMA`. Verifique con **Configuración → Probar conexión** que el acceso al subsitio y a la biblioteca funciona. Si su tenant no admite el acceso al subsitio con `Sites.Selected`, la alternativa documentada es `Files.ReadWrite.All` **delegado** (`GRAPH_DELEGATED_SCOPES=Files.ReadWrite.All`): sigue limitado por los permisos de cada usuario, pero no restringe la aplicación a un sitio concreto.

## Endpoints utilizados

| Operación | Endpoint | Quién |
|---|---|---|
| Resolver sitio/subsitio | `GET /sites/{host}:/sites/OperacionesIngenierayMantenimiento/IMA` | Diagnóstico (admin) |
| Bibliotecas del sitio | `GET /sites/{site-id}/drives` | Diagnóstico (admin) |
| Elemento / metadatos | `GET /drives/{drive-id}/items/{item-id}` | Todos |
| Subcarpetas y documentos | `GET /drives/{drive-id}/items/{item-id}/children` (paginado) | Todos |
| Crear carpeta | `POST …/items/{parent-id}/children` con `@microsoft.graph.conflictBehavior: fail` | Contratista / admin |
| Renombrar | `PATCH …/items/{item-id}` | Admin |
| Eliminar (a la papelera) | `DELETE …/items/{item-id}` | Admin |
| Carga simple (≤ 4 MB) | `PUT …/items/{parent-id}:/{nombre}:/content?@microsoft.graph.conflictBehavior=fail\|replace` | Contratista / admin |
| Sesión de carga | `POST …/items/{parent-id}:/{nombre}:/createUploadSession` y `PUT {uploadUrl}` por fragmentos (múltiplos de 320 KiB, sin encabezado Authorization) | Contratista / admin |
| Estado / cancelación de sesión | `GET` / `DELETE {uploadUrl}` | Contratista / admin |
| Invitación B2B | `POST /invitations` | Admin |
| Buscar usuario | `GET /users/{upn}` · `GET /users?$filter=mail eq '…'` | Admin |

## Manejo de errores

- 429/503/504: reintento automático respetando `Retry-After` (operaciones idempotentes) y reintentos controlados de fragmentos desde el navegador.
- 401: se solicita volver a iniciar sesión. 403: «SharePoint denegó el acceso». 404: «no existe o no es visible». 409 `nameAlreadyExists`: duplicado (incluye condiciones de carrera). 507: cuota del sitio.
- Nunca se registran tokens, encabezados `Authorization` ni URL de sesiones de carga (se cifran en BD y se omiten en auditoría).
