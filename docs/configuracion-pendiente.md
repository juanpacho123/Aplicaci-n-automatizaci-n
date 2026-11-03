# Configuración pendiente de Microsoft 365

Lista explícita de lo que el administrador debe completar antes de poner el portal en servicio. **Mientras no se complete, el portal funciona solo en modo demostración** (o muestra «falta completar la configuración administrativa» en modo producción); no simula conexión con SharePoint.

## Estado verificado al entregar

| Elemento | Estado |
|---|---|
| Aplicación, base de datos, autorización, carga por fragmentos, auditoría | Implementado; 146 pruebas automatizadas superadas |
| Integración con Graph (código) | Implementada y probada contra respuestas simuladas de Graph |
| Conexión real al tenant `dac365` | **No realizada**: el entorno de desarrollo no tenía salida de red a `graph.microsoft.com` ni a `dac365.sharepoint.com`, ni credenciales |
| Estructura real de la biblioteca | **No consultada** (solo se dedujeron sitio, subsitio y biblioteca a partir de la URL) |
| Imágenes de referencia de la estructura | No se recibieron en el entorno |

## 1. Microsoft Entra ID — administrador global o de aplicaciones

- [ ] Registrar la aplicación (un solo inquilino, web) con URI de redirección `https://<dominio>/api/auth/callback`. → [entra-id.md](entra-id.md)
- [ ] Crear certificado (recomendado) o secreto de cliente.
- [ ] Notificaciones opcionales del token de id.: `email`, `acct`.
- [ ] Permisos delegados de Graph: `openid profile email offline_access User.Read Sites.Selected User.Invite.All User.ReadBasic.All`.
- [ ] **Conceder consentimiento de administrador**.
- [ ] (Recomendado) Acceso condicional con MFA para invitados y administradores.
- [ ] Entregar al responsable técnico: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` y la credencial (por canal seguro, nunca por correo ni en el repositorio).

## 2. Invitados B2B — administrador de Entra ID

- [ ] Habilitar **código de acceso de un solo uso por correo**. → [invitados-b2b.md](invitados-b2b.md)
- [ ] Verificar que la directiva de invitaciones permite invitar a los administradores del portal (rol **Invitador de invitados**).
- [ ] Revisar restricciones de dominios y acceso entre inquilinos.

## 3. SharePoint — administrador de SharePoint

- [ ] Conceder la aplicación sobre el sitio `OperacionesIngenierayMantenimiento` con permiso `write` (`Sites.Selected`). → [microsoft-graph.md](microsoft-graph.md)
- [ ] Uso compartido externo del sitio: al menos «Invitados existentes».
- [ ] Ejecutar `npm run sp:discover` (solo lectura) y registrar `SHAREPOINT_SITE_ID` y `SHAREPOINT_DRIVE_ID`. → [sharepoint.md](sharepoint.md)
- [ ] Con el informe, decidir el modelo de ubicaciones (compartida por proyecto o por empresa).

## 4. Servidor

- [ ] PostgreSQL de producción (base nueva).
- [ ] Variables: `APP_MODE=production`, `APP_URL`, `DATABASE_URL`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, Entra ID y SharePoint. → [.env.example](../.env.example)
- [ ] HTTPS, proxy con cuerpo ≥ 8 MB y salida a Microsoft. → [despliegue.md](despliegue.md)
- [ ] `npx prisma migrate deploy` y `npm run admin:bootstrap`.

## 5. Validación con el tenant real (antes de habilitar contratistas)

- [ ] Configuración → **Probar conexión**: sitio, biblioteca y acceso en verde.
- [ ] Registrar un proyecto, asociar su carpeta y **Verificar estructura**.
- [ ] Invitar a un contratista de prueba, aceptar la invitación, conceder permisos en SharePoint y comprobar:
  - [ ] ve solo su proyecto;
  - [ ] crea una subcarpeta (aparece en SharePoint con su nombre como autor);
  - [ ] carga un archivo pequeño y uno > 4 MB (sesión de carga) y ambos aparecen en SharePoint;
  - [ ] un duplicado se detecta y no se sobrescribe;
  - [ ] al suspenderlo, no puede operar.
- [ ] Revisar la auditoría de todas las operaciones anteriores.

> Política acordada: antes de ejecutar cualquier operación que **modifique** SharePoint durante la puesta en marcha, se presentará la ruta identificada y se pedirá su autorización. El portal la aplica de forma permanente para la creación de carpetas de estructura (confirmación escribiendo la ruta exacta).
