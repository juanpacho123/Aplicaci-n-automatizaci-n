# Pruebas

| Suite | Herramienta | Ubicación | Base de datos |
|---|---|---|---|
| Unitarias (63) | Vitest | `tests/unit` | — |
| Integración y autorización (69) | Vitest + PostgreSQL real + rutas API reales | `tests/integration` | `portal_test` |
| End-to-end, escritorio y móvil (14) | Playwright + compilación de producción | `tests/e2e` | `portal_e2e` |

```bash
npm test
```

```bash
npm run test:e2e
```

Las bases `portal_test` y `portal_e2e` deben existir (las migraciones se aplican solas). Variables opcionales: `TEST_DATABASE_URL`, `E2E_DATABASE_URL`.

La integración con Microsoft Graph se prueba con un `fetch` simulado que verifica endpoints, cuerpos, encabezados (incluida la ausencia de `Authorization` en URL de sesiones de carga), reintentos y traducción de errores. **No sustituye** la prueba contra el tenant real (ver configuracion-pendiente.md).

## Casos obligatorios cubiertos

| Caso | Prueba |
|---|---|
| Usuario autorizado puede ingresar | integration/auth «usuario autorizado puede ingresar» |
| Usuario no autorizado no puede ingresar | integration/auth «usuario no autorizado…» |
| Usuario suspendido no puede operar | integration/auth (suspensión, USER_NOT_ACTIVE), integration/uploads (suspendido a mitad de carga), e2e/security |
| Identidad diferente no suplanta | integration/auth «una identidad diferente no puede suplantar…» |
| Contratista ve solo sus proyectos | integration/permissions, e2e/security |
| No puede cargar en otro proyecto | integration/permissions «no puede cargar documentos en carpetas ajenas» |
| No puede crear carpetas en otro proyecto | integration/permissions, e2e/security |
| Administrador consulta todos los proyectos | integration/permissions |
| Consultar estructura de SharePoint | integration/folders «consulta de estructura», unit/graph-provider |
| Crear carpeta / anidadas / árbol actualizado | integration/folders, e2e/contractor-upload |
| Evitar duplicados (incl. concurrencia) | integration/folders |
| Rechazar rutas inválidas | integration/folders, unit/names |
| Cargar uno y varios archivos, progreso | integration/uploads, e2e/contractor-upload |
| Detectar duplicados | integration/uploads, e2e/contractor-upload |
| Manejar errores (parcial, cancelación, rangos) | integration/uploads |
| Registrar la carga | integration/uploads (historial y auditoría) |
| Confirmar que el archivo existe | integration/uploads (lectura del elemento y del contenido) |
| Crear contratista / autorizar / asignar / suspender / historial | integration/admin, e2e/admin |
| Manipular ID de proyecto | integration/permissions |
| Cargar en carpetas ajenas | integration/permissions |
| Panel administrativo como contratista | integration/permissions, e2e/security |
| Operaciones sin autenticación | integration/auth, integration/permissions, e2e/security |
