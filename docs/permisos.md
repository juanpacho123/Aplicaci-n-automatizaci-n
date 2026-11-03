# Permisos necesarios

## Microsoft Entra ID

| Elemento | Requisito | Motivo |
|---|---|---|
| Registro de aplicación | Un solo inquilino, aplicación web confidencial | Solo cuentas del directorio (miembros e invitados) |
| Consentimiento de administrador | Administrador global o de aplicaciones | `Sites.Selected` y `User.Invite.All` lo requieren |
| Rol de los administradores del portal | **Invitador de invitados** (o la directiva de invitación lo permite) | Enviar invitaciones B2B con su identidad |
| Código de un solo uso por correo | Habilitado | Contratistas sin cuenta Microsoft |

## Microsoft Graph (todos delegados)

| Permiso | Quién lo usa | Alcance real |
|---|---|---|
| `openid`, `profile`, `email`, `offline_access`, `User.Read` | Todos | Identidad y renovación de sesión |
| `Sites.Selected` | Todos | Solo el sitio concedido a la aplicación **y** solo lo que el usuario puede en SharePoint |
| `User.Invite.All` | Administradores del portal | Crear invitaciones B2B |
| `User.ReadBasic.All` | Administradores del portal | Localizar cuentas del directorio por correo |

Alternativa si `Sites.Selected` no es viable para el subsitio: `Files.ReadWrite.All` delegado (limitado igualmente por los permisos de cada usuario). **No se usan permisos de aplicación.**

## SharePoint

| Elemento | Requisito |
|---|---|
| Concesión de la aplicación al sitio (con `Sites.Selected`) | `write` sobre `/sites/OperacionesIngenierayMantenimiento` (ver microsoft-graph.md) |
| Uso compartido externo del sitio | Al menos «Invitados existentes» |
| Contratistas | Colaborar/Editar en las carpetas de sus proyectos |
| Rol Consulta | Lectura |
| Administradores del portal | Edición o Control total en la biblioteca |

## Portal (roles internos)

| Permiso | Administrador | Contratista | Consulta |
|---|:-:|:-:|:-:|
| Ver proyectos autorizados | ✔ (todos) | ✔ | ✔ |
| Ver carpetas y documentos | ✔ | ✔ | ✔ |
| Cargar documentos | ✔ | ✔ | — |
| Reemplazar documentos | ✔ | Configurable | — |
| Crear subcarpetas | ✔ | ✔ (dentro de etapas) | — |
| Renombrar/eliminar carpetas adicionales | ✔ | — | — |
| Historial propio / completo | ✔ / ✔ | ✔ / — | — |
| Usuarios, solicitudes, proyectos, auditoría, configuración | ✔ | — | — |

## Base de datos

Use un usuario de PostgreSQL propietario del esquema solo para migraciones y, si su política lo exige, un usuario de ejecución con `SELECT/INSERT/UPDATE/DELETE` sobre las tablas (sin `TRUNCATE` ni DDL). La inmutabilidad de `audit_logs` la garantiza un trigger independientemente del usuario.
