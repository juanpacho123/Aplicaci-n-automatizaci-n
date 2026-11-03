/**
 * Matriz de permisos por rol. Es la única fuente de verdad: el menú del frontend
 * se deriva de aquí, pero cada operación se vuelve a comprobar en el backend.
 */
export type RoleKey = "ADMIN" | "CONTRACTOR" | "VIEWER";

export const PERMISSIONS = [
  "project:read",
  "project:read:all",
  "folder:read",
  "folder:create",
  "folder:rename",
  "folder:delete",
  "document:read",
  "document:upload",
  "document:replace",
  "history:read:own",
  "history:read:all",
  "admin:access",
  "users:manage",
  "companies:manage",
  "requests:manage",
  "projects:manage",
  "audit:read",
  "settings:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  CONTRACTOR: ["project:read", "folder:read", "folder:create", "document:read", "document:upload", "history:read:own"],
  VIEWER: ["project:read", "folder:read", "document:read"],
};

export function permissionsFor(role: RoleKey): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function can(role: RoleKey, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

/** Reemplazar documentos: administradores siempre; contratistas solo si la configuración lo autoriza. */
export function canReplace(role: RoleKey, allowContractorReplace: boolean): boolean {
  return role === "ADMIN" || (role === "CONTRACTOR" && allowContractorReplace);
}

export type NavItem = { href: string; label: string; icon: string; permission: Permission; exact?: boolean };

export const CONTRACTOR_NAV: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: "home", permission: "project:read" },
  { href: "/cargar", label: "Cargar documentos", icon: "upload", permission: "document:upload" },
  { href: "/proyectos", label: "Mis proyectos", icon: "folders", permission: "project:read" },
  { href: "/historial", label: "Historial de cargas", icon: "history", permission: "history:read:own" },
  { href: "/perfil", label: "Mi perfil", icon: "user", permission: "project:read" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Panel de control", icon: "dashboard", permission: "admin:access", exact: true },
  { href: "/admin/contratistas", label: "Contratistas", icon: "users", permission: "users:manage" },
  { href: "/admin/solicitudes", label: "Solicitudes de acceso", icon: "inbox", permission: "requests:manage" },
  { href: "/admin/proyectos", label: "Proyectos", icon: "briefcase", permission: "projects:manage" },
  { href: "/admin/documental", label: "Gestión documental", icon: "folderTree", permission: "folder:rename" },
  { href: "/admin/operaciones", label: "Historial de operaciones", icon: "history", permission: "history:read:all" },
  { href: "/admin/auditoria", label: "Auditoría", icon: "shield", permission: "audit:read" },
  { href: "/admin/configuracion", label: "Configuración", icon: "settings", permission: "settings:manage" },
];

export function navigationFor(role: RoleKey): NavItem[] {
  const source = role === "ADMIN" ? ADMIN_NAV : CONTRACTOR_NAV;
  return source.filter((item) => can(role, item.permission));
}

export function homePathFor(role: RoleKey): string {
  return role === "ADMIN" ? "/admin" : "/inicio";
}
