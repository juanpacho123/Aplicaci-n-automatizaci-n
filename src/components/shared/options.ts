export const FILE_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pendiente" },
  { value: "IN_PROGRESS", label: "En proceso" },
  { value: "SUCCESS", label: "Cargado correctamente" },
  { value: "ERROR", label: "Error" },
  { value: "CANCELLED", label: "Cancelado" },
];

export const USER_STATUS_OPTIONS = [
  { value: "PENDING_APPROVAL", label: "Pendiente de aprobación" },
  { value: "INVITATION_SENT", label: "Invitación enviada" },
  { value: "ACTIVE", label: "Activo" },
  { value: "SUSPENDED", label: "Suspendido" },
  { value: "REJECTED", label: "Rechazado" },
];

export const ROLE_OPTIONS = [
  { value: "CONTRACTOR", label: "Contratista" },
  { value: "VIEWER", label: "Consulta" },
  { value: "ADMIN", label: "Administrador" },
];

export const AUDIT_CATEGORY_OPTIONS = [
  { value: "AUTH", label: "Autenticación" },
  { value: "USERS", label: "Usuarios" },
  { value: "COMPANIES", label: "Empresas" },
  { value: "ACCESS_REQUESTS", label: "Solicitudes de acceso" },
  { value: "PROJECTS", label: "Proyectos" },
  { value: "FOLDERS", label: "Carpetas" },
  { value: "DOCUMENTS", label: "Documentos" },
  { value: "SETTINGS", label: "Configuración" },
  { value: "SECURITY", label: "Seguridad" },
];
