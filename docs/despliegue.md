# Guía de despliegue

## Arquitectura recomendada

```
Usuarios ──HTTPS──▶ Proxy inverso / balanceador (TLS) ──▶ Portal (Node.js 22, `next start`) ──▶ PostgreSQL gestionado
                                                                       └──▶ login.microsoftonline.com, graph.microsoft.com, *.sharepoint.com
```

## Requisitos de red

Salida HTTPS desde el servidor hacia `login.microsoftonline.com`, `graph.microsoft.com` y `dac365.sharepoint.com` (las URL de sesiones de carga apuntan a SharePoint).

## Proxy inverso

- Terminación TLS y redirección HTTP→HTTPS. `APP_URL` debe ser la URL pública HTTPS.
- Tamaño máximo de cuerpo ≥ fragmento configurado + margen (por defecto 5 MiB → p. ej. `client_max_body_size 8m` en nginx).
- Tiempo de espera de lectura ≥ 180 s para fragmentos grandes.
- Reenvíe `X-Forwarded-For` y configure `TRUST_PROXY=true` solo si el proxy es de confianza.

## Contenedor

```bash
docker build -t portal-documental .
```

```bash
docker run --rm --env-file .env.production portal-documental npx prisma migrate deploy
```

```bash
docker run -d --name portal -p 3000:3000 --env-file .env.production -v /ruta/segura/cert.pem:/secrets/cert.pem:ro portal-documental
```

Con certificado: `ENTRA_CLIENT_CERT_PRIVATE_KEY_PATH=/secrets/cert.pem`.

## Alternativas administradas

- **Azure App Service (Linux, Node 22)** o **Azure Container Apps**: configure las variables como «App settings», los secretos en **Azure Key Vault** (referencias de Key Vault) y el certificado como secreto. Base de datos: **Azure Database for PostgreSQL – Servidor flexible**.
- Escalado horizontal: las sesiones están en PostgreSQL (sin afinidad necesaria). El limitador de solicitudes es en memoria; con varias instancias, sustituya su almacén por uno compartido (p. ej. Redis) en `src/lib/security/rate-limit.ts`.

## Operación

| Tarea | Frecuencia |
|---|---|
| `npx prisma migrate deploy` | En cada versión, antes de iniciar |
| Rotación del secreto/certificado de Entra ID | Antes de su vencimiento |
| Rotación de `SESSION_SECRET` | Según política (cierra sesiones activas) |
| Rotación de `TOKEN_ENCRYPTION_KEY` | Según política (obliga a reautenticarse; las cargas en curso se reinician) |
| `npm run audit:purge` | Programado (p. ej. mensual) según la retención configurada |
| Copia de seguridad de PostgreSQL | Diaria |
| Revisión de errores de carga y accesos denegados | Semanal (Historial de operaciones, Auditoría) |

Los registros técnicos van a la salida estándar (con identificador de correlación en errores 500) y no contienen tokens ni secretos.
