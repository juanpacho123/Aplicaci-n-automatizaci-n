# SharePoint Online

## Ubicación identificada a partir del enlace

Enlace proporcionado: `https://dac365.sharepoint.com/sites/OperacionesIngenierayMantenimiento/IMA/Proyectos%20de%20Inversin%20Operaciones/Forms/AllItems.aspx`

| Elemento | Valor deducido | Variable |
|---|---|---|
| Inquilino de SharePoint | `dac365.sharepoint.com` | `SHAREPOINT_HOSTNAME` |
| Colección de sitios | `/sites/OperacionesIngenierayMantenimiento` | — |
| Subsitio | `IMA` | `SHAREPOINT_SITE_PATH=/sites/OperacionesIngenierayMantenimiento/IMA` |
| Biblioteca (URL) | `/sites/OperacionesIngenierayMantenimiento/IMA/Proyectos de Inversin Operaciones` | `SHAREPOINT_LIBRARY_URL` |
| Nombre visible probable | «Proyectos de Inversión Operaciones» (la URL interna perdió la «ó») | — |
| Site ID / Drive ID | **Se obtienen con una consulta real**, no se inventan | `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_ID` |

Estos valores son una deducción a partir de la URL. **La estructura interna de carpetas aún no se ha consultado**: el entorno de desarrollo no tenía acceso de red ni credenciales del tenant. El primer paso con credenciales es ejecutar el descubrimiento.

## Descubrimiento de la estructura (solo lectura)

```bash
npm run sp:discover -- --depth 3
```

El script inicia sesión con su cuenta (código de dispositivo), resuelve el sitio y la biblioteca, imprime `SHAREPOINT_SITE_ID` y `SHAREPOINT_DRIVE_ID`, recorre las carpetas y señala las que contienen etapas (Inicio/Ejecución/Cierre) indicando subcarpetas faltantes. Escribe un informe en `reports/` (excluido del repositorio). **Solo emite solicitudes GET**: no modifica nada.

Con el informe se decide cómo se relacionan contratistas y proyectos:

- **«Proyecto / Etapas»** (una carpeta por proyecto): una ubicación **compartida** por proyecto.
- **«Contratista / Proyecto / Etapas»** (una carpeta por contratista con sus proyectos dentro): una ubicación **por empresa** en cada proyecto.
- Ambos modelos pueden coexistir: si hay ubicación de la empresa, se usa; si no, la compartida.

## Asociación en el portal

1. **Proyectos → Registrar proyecto** (código y nombre).
2. **Asociar carpeta de SharePoint**: se navega la biblioteca real y se elige la carpeta del proyecto (o de la empresa). Se guardan los identificadores devueltos por Graph; no se aceptan rutas escritas a mano.
3. **Verificar estructura**: consulta de solo lectura que identifica las etapas por nombre (configurable en Configuración → Estructura documental) y las subcarpetas iniciales:
   - Ejecución: 2.01 Documentación contratista · 2.02 Reunión antes de la construcción · 2.03 Simulacro · 2.04 Compras · 2.05 Materiales, equipo y estudio · 2.06 Seguimiento · 2.07 Planos · 2.08 Plan de calidad.
   - Cierre: Dossier · Entrenamiento del personal.
   - Inicio: se muestran las carpetas que existan.
4. Si falta una carpeta de la estructura, el portal lo **informa**. Crearla es una **operación controlada**: el administrador ve la ruta exacta y debe escribirla para autorizar. Nunca se crea, renombra ni elimina nada automáticamente, y no se duplican carpetas existentes (la comparación ignora mayúsculas, tildes y espacios).

## Reglas sobre la estructura

- Los contratistas no pueden renombrar ni eliminar carpetas; pueden crear subcarpetas dentro de las etapas de sus proyectos (configurable en la raíz de cada etapa) hasta la profundidad máxima configurada.
- El administrador puede renombrar o eliminar solo **carpetas adicionales**; la raíz del proyecto, las carpetas de etapa y las subcarpetas iniciales están protegidas. La eliminación exige escribir el nombre y envía el contenido a la papelera del sitio.
- Los nombres se validan con las reglas de SharePoint (caracteres `" * : < > ? / \ |`, nombres reservados, longitud, punto final).

## Permisos de los contratistas en SharePoint

Como el sitio es privado y usted concede los permisos desde su cuenta:

| Rol del portal | Permiso en las carpetas de sus proyectos |
|---|---|
| Contratista | Colaborar / Editar (crear carpetas y cargar archivos) |
| Consulta | Lectura |
| Administrador del portal | Control total o Edición sobre la biblioteca |

El portal no amplía permisos: si un contratista está autorizado en el portal pero no en SharePoint, la operación se rechaza con un mensaje claro.
