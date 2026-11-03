# Contratistas externos: Microsoft Entra B2B

Los contratistas que no pertenecen a la organización acceden como **invitados B2B**. El portal envía la invitación real con la identidad del administrador que autoriza (permiso delegado `User.Invite.All`) y fija de inmediato el identificador del invitado (`oid`): el inicio de sesión exigirá exactamente esa identidad.

## Flujo

1. El administrador registra al contratista (correo, empresa, proyectos) y pulsa **Autorizar**.
2. El portal llama a `POST /invitations` → estado **Invitación enviada**; queda registro en `invitations` y en auditoría.
3. Microsoft envía el correo de invitación (si «Microsoft envía el correo de invitación B2B» está activo en Configuración).
4. El contratista acepta y verifica su identidad:
   - con su cuenta Microsoft / Entra ID de su empresa, o
   - con **código de un solo uso enviado al correo** si no tiene cuenta Microsoft.
5. Es redirigido a `/login`, inicia sesión y el portal comprueba `tid` + `oid` → estado **Activo**.

El portal **no simula invitaciones**: si falta la configuración o el permiso, la invitación queda como **fallida**, se muestra el motivo y el usuario permanece pendiente.

## Configuración del inquilino (administrador de Entra ID)

1. **Código de acceso de un solo uso por correo** — *Identidades externas → Todos los proveedores de identidad → Código de acceso de un solo uso por correo electrónico*: **Habilitado**.
2. **Configuración de colaboración externa** — *Identidades externas → Configuración de colaboración externa*:
   - Acceso de usuarios invitados: el valor predeterminado («acceso limitado a propiedades y pertenencias de objetos de directorio») es suficiente.
   - Configuración de invitaciones: debe permitir invitar a quien administre el portal (rol **Invitador de invitados** o superior asignado a los administradores del portal).
   - Restricciones de colaboración: si se usa una lista de dominios permitidos, incluya los dominios de los contratistas.
3. **Configuración de acceso entre inquilinos** — si los contratistas tienen su propio Entra ID, la colaboración B2B entrante debe estar permitida (predeterminado). Opcional: confiar en la MFA del inquilino de origen.
4. **Acceso condicional** — se recomienda exigir MFA a los invitados para esta aplicación.

## SharePoint para invitados

El sitio es privado y los permisos de cada contratista los concede usted desde su cuenta. Para que un invitado pueda acceder:

- *Centro de administración de SharePoint → Directivas → Uso compartido*: el nivel de la organización debe permitir al menos **Invitados existentes**.
- *Sitios activos → OperacionesIngenierayMantenimiento → Uso compartido*: **Invitados existentes** (o superior).
- Conceda al invitado permisos sobre las carpetas de sus proyectos (Colaborar/Editar para contratistas; Lectura para consulta). Hágalo **después** de que el invitado exista en el directorio (tras la invitación).

El portal valida su propia autorización **y** los permisos reales de SharePoint: si SharePoint devuelve 403, el contratista verá «SharePoint denegó el acceso a esta ubicación».

## Revocación

**Suspender** en el portal bloquea inicios de sesión y operaciones, invalida las sesiones y elimina la caché de tokens. Para impedir también el acceso directo a SharePoint, retire los permisos del invitado en el sitio o bloquee/elimine la cuenta de invitado en Entra ID.
