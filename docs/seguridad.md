# Seguridad

| Control | Implementación |
|---|---|
| Autenticación | Microsoft Entra ID (OIDC, código + PKCE, `state` y `nonce` en cookie cifrada de 10 min). Sin registro libre. |
| Identidad | Vínculo por `tid` + `oid`; el correo nunca es prueba de identidad. Un correo ya vinculado a otro `oid` se rechaza y se audita como posible suplantación. |
| Sesiones | Token aleatorio de 256 bits; en BD solo su SHA-256. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` + prefijo `__Host-` con HTTPS. Caducidad por inactividad y absoluta (configurables). Revocación al cerrar sesión, suspender, rechazar o cambiar de rol. |
| Tokens de Microsoft | Solo en el servidor, caché MSAL cifrada con AES-256-GCM (clave `TOKEN_ENCRYPTION_KEY`), particionada por cuenta. Se elimina al cerrar sesión o suspender. |
| Autorización | En el backend para cada operación: rol, proyecto (`user_projects`), carpeta (cadena de padres hasta la ubicación del proyecto) y permisos reales de SharePoint (token delegado). |
| CSRF | Token por sesión en encabezado `x-csrf-token` + verificación de `Origin`. |
| XSS | React escapa todo el contenido; no se usa `dangerouslySetInnerHTML`; CSP con nonce para scripts (`strict-dynamic`), `frame-ancestors 'none'`, `object-src 'none'`. |
| Cabeceras | HSTS (HTTPS), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, COOP. |
| Entradas | Zod en todas las rutas; validación de nombres según SharePoint; identificadores con formato estricto. |
| Archivos | Extensiones permitidas, tamaño máximo, cantidad por operación, archivos vacíos, `Content-Length` comprobado antes de leer el cuerpo, `Content-Range` estricto, fragmentos de 320 KiB. Validado en navegador **y** servidor. |
| Rutas manipuladas | Nunca se construyen rutas a partir de texto del usuario: se opera por identificadores verificados contra la ubicación del proyecto. |
| Sobrescritura | `conflictBehavior=fail` por defecto; reemplazo solo con decisión explícita y permiso. |
| Límites de solicitudes | Ventana deslizante por usuario/IP (formularios públicos, inicio de sesión, mutaciones, fragmentos). En memoria: para varias instancias, sustituir por un almacén compartido. |
| Errores | Manejo centralizado; al cliente solo mensaje y código; en el servidor, registro con identificador de correlación. |
| Auditoría | Inmutable a nivel de BD; sin contraseñas, tokens ni secretos (saneado recursivo). IP y agente configurables. |
| Secretos | Solo variables de entorno del servidor; `.env*`, certificados e informes excluidos de Git. |
| Separación de entornos | BD sellada como DEMO o PRODUCTION; el modo demostración nunca se conecta a SharePoint y lo indica en pantalla. |
| Solicitudes públicas | Respuesta uniforme (no revela si un correo existe), campo trampa anti-bots, límite por IP, código de seguimiento almacenado como hash. |
| Redirecciones | `returnTo` limitado a rutas internas. |
