# Base de datos

PostgreSQL 14+ con Prisma 7 (`prisma/schema.prisma`, migraciones en `prisma/migrations`). **No se almacena el contenido de los documentos**: solo metadatos, autorizaciones, historial, auditoría y referencias (identificadores de SharePoint).

## Entidades

| Tabla | Propósito |
|---|---|
| `roles` | Roles del sistema: `ADMIN`, `CONTRACTOR`, `VIEWER` (datos de referencia insertados por la migración). |
| `companies` | Empresas contratistas. Carpeta de SharePoint opcional de la empresa. |
| `users` | Usuarios autorizados: correo (minúsculas, único), nombre, empresa, teléfono, rol, estado, tipo de identidad, `entra_tenant_id` + `entra_object_id` (únicos en conjunto), quién y cuándo autorizó, último cambio de estado y motivo. |
| `sessions` | Sesiones de la aplicación (hash SHA-256 del token, token CSRF, expiración, revocación, IP/agente). |
| `token_caches` | Caché MSAL **cifrada** (AES-256-GCM) por cuenta. |
| `access_requests` | Solicitudes públicas de acceso (estado, revisión, información adicional, hash del código de seguimiento). |
| `invitations` | Invitaciones B2B enviadas o fallidas (id de invitación de Graph, oid del invitado, error). |
| `projects` | Proyectos (código único, nombre, estado). |
| `user_projects` | Proyectos autorizados por usuario (quién y cuándo asignó). |
| `project_locations` | Carpeta raíz de SharePoint del proyecto (site/drive/item id, ruta); compartida o por empresa. |
| `project_stage_folders` | Mapeo etapa → carpeta real verificado. |
| `folder_operations` | Creación / renombrado / eliminación de carpetas desde el portal (usuario, ruta, resultado). |
| `upload_operations` | Operaciones de carga (usuario, proyecto, etapa, carpeta, contadores, estado, entorno). |
| `uploaded_files` | Archivos de cada operación (nombre original/final, tamaño, estado, intentos, id/URL en SharePoint, verificación, error). |
| `audit_logs` | Auditoría inmutable (sin claves foráneas: instantánea del actor). |
| `system_settings` | Configuración administrativa por secciones y sello de entorno. |
| `demo_drive_items`, `demo_upload_sessions` | Solo modo demostración: biblioteca local emulada. |

## Restricciones adicionales (migración `init`)

- `CHECK` de correo en minúsculas (`users`, `access_requests`).
- Unicidad sin distinguir mayúsculas de nombre de empresa y código de proyecto.
- Índices únicos parciales: una sola ubicación compartida por proyecto; una por (proyecto, empresa).
- Coherencia de contadores de carga y tamaños.
- **Auditoría de solo inserción**: triggers que rechazan `UPDATE`, `DELETE` y `TRUNCATE` sobre `audit_logs`. La depuración por retención solo es posible con `SET LOCAL app.audit_purge = 'on'` dentro de la transacción del script `npm run audit:purge`.

## Estados

- Usuario: `PENDING_APPROVAL` → (`INVITATION_SENT`) → `ACTIVE` ⇄ `SUSPENDED`; `REJECTED`.
- Archivo: `PENDING` → `IN_PROGRESS` → `SUCCESS` | `ERROR` | `CANCELLED`. Las cargas sin actividad por más de 6 horas pasan a `ERROR` («interrumpida»).
- Operación: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `PARTIAL`, `FAILED`, `CANCELLED` (se recalcula a partir de sus archivos).

## Operación

```bash
npx prisma migrate deploy
```

Nuevas migraciones en desarrollo: modifique `schema.prisma` y genere el SQL con `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` en una carpeta nueva de `prisma/migrations`, o use `npx prisma migrate dev` en una terminal interactiva.

Copias de seguridad: respalde la base de datos con la política de la organización. Los documentos se respaldan con SharePoint/Microsoft 365.
