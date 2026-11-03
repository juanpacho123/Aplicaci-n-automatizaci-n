# Instalación y ejecución

## Requisitos

- Node.js 22 o superior.
- PostgreSQL 14 o superior.
- Para producción: configuración de Microsoft 365 completa ([configuracion-pendiente.md](configuracion-pendiente.md)).

## Instalación

```bash
npm install
```

```bash
cp .env.example .env
```

Genere los secretos:

```bash
openssl rand -base64 48
```

```bash
openssl rand -base64 32
```

Use el primero en `SESSION_SECRET` y el segundo en `TOKEN_ENCRYPTION_KEY`. Configure `DATABASE_URL`.

```bash
npx prisma migrate deploy
```

## Modo demostración

```bash
npm run db:seed:demo
```

```bash
npm run dev
```

Usuarios ficticios: administradora, dos contratistas activos, un usuario de consulta, uno suspendido y uno pendiente. Proyectos `PI-2024-001` a `PI-2025-004` (el `PI-2025-003` tiene estructura incompleta a propósito, para probar la verificación).

## Modo producción

1. Base de datos nueva y vacía (no reutilice la de demostración: está sellada como DEMO).
2. `.env` con `APP_MODE=production`, `APP_URL` HTTPS, variables de Entra ID y SharePoint.
3. Migraciones y primer administrador:

```bash
npx prisma migrate deploy
```

```bash
npm run admin:bootstrap -- --email admin@empresa.com --name "Nombre Apellido"
```

4. Compilar e iniciar:

```bash
npm run build
```

```bash
npm start
```

5. Inicie sesión como administrador, abra **Configuración → Probar conexión**, registre proyectos y asocie sus carpetas.

## Verificaciones

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```
