# Arquitectura

## Visión general

```
Navegador ──HTTPS──▶ Next.js (App Router)
                      ├─ proxy.ts ............ cabeceras de seguridad, CSP con nonce, redirección optimista
                      ├─ Páginas (RSC) ....... leen datos llamando a servicios con el mismo control de acceso
                      ├─ Route Handlers /api . única vía de mutación (JSON); CSRF + origen + límites
                      └─ Servicios (src/lib) ─┬─ PostgreSQL (Prisma): autorizaciones, historial, auditoría
                                              └─ Proveedor de almacenamiento
                                                   ├─ GraphStorageProvider → Microsoft Graph → SharePoint
                                                   └─ DemoStorageProvider  → disco local (solo APP_MODE=demo)
```

El navegador **nunca** habla con Microsoft Graph ni recibe tokens o URL de sesiones de carga. Todas las operaciones sobre SharePoint pasan por el servidor con el **token delegado del propio usuario**, de modo que SharePoint aplica sus permisos reales y registra al contratista como autor.

## Capas y carpetas

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Presentación | `src/app`, `src/components` | Páginas, layout por rol, sistema de diseño (`components/ui`), módulos de carga y administración. Sin lógica de Graph. |
| Autenticación | `src/lib/auth` | OIDC con MSAL Node (código + PKCE + state + nonce), sesiones en BD, caché de tokens cifrada, vinculación de identidad (tid/oid). |
| Autorización | `src/lib/authz` | Matriz de permisos por rol (`policy.ts`), guardias (`guards.ts`): sesión → usuario activo → CSRF → límite → permiso. |
| Lógica de negocio | `src/lib/services` | Proyectos y alcance, carpetas, cargas, usuarios, solicitudes, estructura, historial, panel, configuración. |
| Integración SharePoint | `src/lib/graph`, `src/lib/storage` | Cliente Graph (reintentos, traducción de errores), sitios, directorio/invitaciones, proveedor de almacenamiento. |
| Persistencia | `prisma/`, `src/lib/db` | Modelo relacional, migraciones, restricciones adicionales en SQL. |
| Auditoría | `src/lib/services/audit.service.ts` | Registro inmutable (trigger en BD), saneado de secretos. |
| Validación | `src/lib/validation` | Esquemas Zod, reglas de nombres de SharePoint, rangos de carga, coincidencia de estructura (código puro, compartido con el navegador). |

## Comprobaciones por solicitud

Cada operación verifica, en el servidor y en este orden:

1. **Identidad autenticada**: cookie de sesión (`HttpOnly`, `SameSite=Lax`, `__Host-` con HTTPS) cuyo hash existe, no revocada, no expirada (inactividad y duración máxima).
2. **Usuario activo**: si no lo está, se revocan todas sus sesiones y se rechaza.
3. **Protección CSRF** (métodos con efectos): encabezado `x-csrf-token` igual al de la sesión + `Origin` del propio portal.
4. **Rol**: permiso requerido según `policy.ts`.
5. **Proyecto autorizado**: relación en `user_projects` y proyecto activo (el administrador accede a todos).
6. **Carpeta autorizada**: se recorre la cadena de padres desde la carpeta indicada hasta la raíz de la ubicación del proyecto; si no se alcanza, se rechaza (protege frente a identificadores manipulados).
7. **Permisos reales de SharePoint**: la llamada a Graph se hace con el token delegado del usuario; un 403 de SharePoint se informa como tal.

Los rechazos de autorización se auditan como `ACCESS_DENIED`.

## Modelo de ubicaciones

Un **proyecto** del portal se asocia a una o varias **ubicaciones** (carpetas reales de la biblioteca, seleccionadas navegando SharePoint):

- Ubicación **compartida** (`company_id` nulo): la usan todos los contratistas del proyecto (estructura «Proyecto / Etapas»).
- Ubicación **por empresa**: para estructuras «Contratista / Proyecto / Etapas». Si existe, el contratista de esa empresa usa la suya.

Dentro de cada ubicación, el administrador **verifica** (solo lectura) la estructura: se identifican las carpetas de etapa por nombre (configurable: «1. Inicio», «2. Ejecución», «3. Cierre», con o sin tildes/numeración) y las subcarpetas iniciales esperadas. El mapeo etapa→carpeta queda guardado; nada se crea automáticamente. Si falta algo, el administrador puede crearlo mediante una operación controlada que exige escribir la ruta exacta.

## Flujo de carga

1. **Verificación previa** (`POST /api/uploads/preflight`): valida nombre, extensión, tamaño y cantidad; detecta nombres existentes y sugiere alternativas.
2. **Operación** (`POST /api/uploads`): revalida todo, exige decisión explícita por cada conflicto (renombrar, o reemplazar si está autorizado) y crea `upload_operations` + `uploaded_files`.
3. Por archivo: `POST …/start` → **carga simple** (≤ 4 MB, `PUT …:/content?conflictBehavior=fail`) o **sesión de carga de Graph** (`createUploadSession`, URL cifrada en BD).
4. El navegador envía fragmentos (`PUT …/content` con `Content-Range`, múltiplos de 320 KiB); el servidor valida y retransmite a Graph. El progreso es real (bytes enviados).
5. Reintentos controlados ante errores transitorios, espera de reconexión y resincronización con `nextExpectedRanges`. Un fallo no detiene a los demás archivos.
6. Al finalizar, el servidor **consulta el elemento en SharePoint** (padre, tamaño) y solo entonces lo marca como «Cargado correctamente» y lo audita.

## Modos de ejecución

| | `APP_MODE=demo` | `APP_MODE=production` |
|---|---|---|
| Inicio de sesión | Lista de usuarios ficticios | Solo Microsoft Entra ID |
| Almacenamiento | Disco local (`DEMO_STORAGE_DIR`) | SharePoint vía Graph |
| Invitaciones | No se envían (se informa) | Invitación B2B real |
| Indicadores visuales | Banner permanente, textos «demostración» | Ninguno |
| Base de datos | Sellada como `DEMO` | Sellada como `PRODUCTION` |

La base de datos se sella con su entorno en el primer arranque (`system.environment`); la aplicación se niega a arrancar si el modo no coincide, de modo que **los datos de demostración no pueden mezclarse con datos reales**. El seed de demostración rechaza ejecutarse fuera de `APP_MODE=demo`.
