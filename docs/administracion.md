# Guía de administración

Guía para administrar el portal sin conocimientos técnicos.

## Primer ingreso

1. Ingrese con su cuenta de Microsoft de la organización.
2. Revise **Configuración → Conexión con Microsoft 365**: todas las comprobaciones deben estar en verde. Pulse **Probar conexión**.
3. Ajuste **Identidad corporativa** (nombre del portal, organización, correo de soporte).

## Proyectos

1. **Proyectos → Registrar proyecto**: código y nombre.
2. Abra el proyecto → **Asociar carpeta de SharePoint**: navegue la biblioteca y seleccione la carpeta del proyecto (la que contiene «1. Inicio», «2. Ejecución», «3. Cierre»).
   - «Aplica a: todos los contratistas» si todos trabajan en la misma carpeta.
   - «Solo <empresa>» si cada contratista tiene su propia carpeta del proyecto.
3. **Verificar estructura**: se muestran las etapas y subcarpetas encontradas y las faltantes. Si necesita crear una carpeta faltante, el portal le muestra la ruta exacta y le pide escribirla para autorizar la operación.

## Contratistas

**Contratistas → Registrar contratista**: nombre, correo, empresa, rol, tipo de identidad y proyectos.

- **Invitado externo**: al autorizar, Microsoft envía la invitación. El estado pasa a «Invitación enviada» y a «Activo» cuando el contratista acepta e inicia sesión.
- **Cuenta de la organización**: queda activa; su identidad se vincula al iniciar sesión.

En la ficha del contratista puede: editar datos, **asignar proyectos** (solo verá esos), cambiar el rol, reenviar la invitación, **suspender** (con motivo; cierra sus sesiones de inmediato y conserva sus documentos e historial), reactivar y consultar su historial.

> Recuerde conceder al contratista permisos en las carpetas de SharePoint de sus proyectos. El portal valida ambos.

**Empresas**: pestaña dentro de Contratistas.

## Solicitudes de acceso

Las personas pueden pedir acceso desde la página pública. Nada se autoriza automáticamente:

- **Aprobar**: confirme nombre, empresa, rol y **elija los proyectos**. Se registra y se invita al usuario.
- **Pedir información**: el solicitante verá su mensaje con su código de seguimiento y podrá responder.
- **Rechazar**: con motivo.

## Gestión documental

Seleccione un proyecto para ver su árbol de carpetas, quién creó cada carpeta (las creadas desde el portal se marcan) y su fecha. Puede crear carpetas, cargar documentos en la carpeta actual y **renombrar o eliminar carpetas adicionales** (la estructura principal está protegida; para eliminar debe escribir el nombre exacto y el contenido va a la papelera del sitio).

## Historial y auditoría

- **Historial de operaciones**: todas las cargas (filtros por contratista, empresa, proyecto, fecha y estado) y las operaciones de carpetas. Cada carga tiene su detalle por archivo.
- **Auditoría**: inicios de sesión, accesos denegados, cambios de permisos, autorizaciones, suspensiones, carpetas, cargas y configuración. No se puede modificar.

## Configuración

- **Parámetros de carga**: tamaño máximo, archivos por operación, extensiones permitidas, si los contratistas pueden reemplazar documentos.
- **Estructura documental**: nombres aceptados para cada etapa y subcarpetas esperadas.
- **Acceso y sesiones**: tiempos de inactividad y duración, vínculo por correo en el primer acceso, mensaje de invitación.
- **Auditoría**: registro de IP y navegador, retención.

## Problemas frecuentes

| Mensaje | Causa probable | Solución |
|---|---|---|
| «SharePoint denegó el acceso a esta ubicación» | El usuario no tiene permisos en esa carpeta de SharePoint | Conceda permisos en SharePoint |
| «Falta completar la configuración administrativa…» | Variable o permiso de Microsoft 365 pendiente | Ver Configuración → Conexión |
| «El proyecto no tiene ubicación configurada» | Proyecto sin carpeta asociada | Proyectos → Asociar carpeta |
| «Etapa no identificada» | La carpeta de etapa tiene otro nombre | Ajuste los nombres aceptados o verifique la estructura |
| Invitación fallida | Falta `User.Invite.All` o rol de invitador | Ver docs/invitados-b2b.md |
| «La identidad autenticada no coincide…» | Otra cuenta intentó usar el correo de un usuario ya vinculado | Revise la auditoría (Seguridad) |
