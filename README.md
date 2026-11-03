# Portal de Gestión Documental

Gestión centralizada de documentación de contratistas y proyectos sobre **SharePoint Online**.

Los contratistas inician sesión con una identidad Microsoft verificada, ven solo sus proyectos autorizados, eligen **Proyecto → Etapa (Inicio / Ejecución / Cierre) → Carpeta**, crean subcarpetas cuando lo necesitan y cargan documentos directamente en las carpetas existentes de SharePoint. El administrador controla usuarios, permisos, proyectos, carpetas y auditoría. **SharePoint sigue siendo el repositorio oficial**: el portal no guarda el contenido de los documentos.

---

## Estado actual

| Área | Estado |
|---|---|
| Aplicación completa (contratista + administración) | Implementada y probada |
| Modo demostración (datos ficticios, almacenamiento local) | Funcionando |
| Integración Microsoft Entra ID / Graph / SharePoint | Implementada y probada con Graph simulado. **Pendiente de conectar al tenant real** (requiere configuración del administrador, ver [docs/configuracion-pendiente.md](docs/configuracion-pendiente.md)) |
| Pruebas | 132 unitarias/integración (Vitest + PostgreSQL real) y 14 end-to-end (Playwright, escritorio y móvil) |

No se marca como funcionando contra SharePoint nada que todavía no se haya ejecutado contra el tenant real.

## Tecnología

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · componentes estilo shadcn/ui sobre Radix · Lucide · Zod · PostgreSQL + Prisma 7 · MSAL Node · Microsoft Graph · Vitest · Playwright.

## Inicio rápido (modo demostración)

Requisitos: Node.js 22+, PostgreSQL 14+.

```bash
npm install
```

```bash
cp .env.example .env
```

Edite `.env`: `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -base64 48`) y `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). Deje `APP_MODE=demo`.

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed:demo
```

```bash
npm run dev
```

Abra http://localhost:3000 y elija un usuario de demostración. En este modo **no hay conexión con SharePoint**: un aviso permanente lo indica y los resultados dicen «Guardado en almacenamiento de demostración».

## Puesta en producción

1. Complete la configuración de Microsoft 365: [docs/configuracion-pendiente.md](docs/configuracion-pendiente.md).
2. Use una base de datos **nueva** (la base queda sellada para un solo entorno).
3. `APP_MODE=production` y variables de Entra ID / SharePoint.
4. `npx prisma migrate deploy` y `npm run admin:bootstrap -- --email admin@empresa.com --name "Nombre"`.
5. `npm run build` y `npm start` (o la imagen Docker). Ver [docs/despliegue.md](docs/despliegue.md).

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run typecheck` / `npm run lint` | Verificación de tipos y estilo |
| `npm test` | Pruebas unitarias y de integración (requiere PostgreSQL; usa la BD `portal_test`) |
| `npm run test:e2e` | Compila y ejecuta Playwright (usa la BD `portal_e2e`) |
| `npm run db:seed:demo` | Datos ficticios (solo con `APP_MODE=demo`) |
| `npm run admin:bootstrap` | Alta del primer administrador |
| `npm run sp:discover` | Descubrimiento **de solo lectura** de la estructura de SharePoint |
| `npm run audit:purge` | Depuración de auditoría según retención |

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Base de datos](docs/base-de-datos.md)
- [Instalación y ejecución](docs/instalacion.md)
- [Microsoft Entra ID](docs/entra-id.md) · [Invitados B2B](docs/invitados-b2b.md)
- [Microsoft Graph](docs/microsoft-graph.md) · [SharePoint](docs/sharepoint.md) · [Permisos necesarios](docs/permisos.md)
- [Seguridad](docs/seguridad.md) · [Pruebas](docs/pruebas.md)
- [Despliegue](docs/despliegue.md) · [Guía de administración](docs/administracion.md)
- [**Configuración pendiente de Microsoft 365**](docs/configuracion-pendiente.md)
