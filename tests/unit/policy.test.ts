import { describe, expect, it } from "vitest";
import { can, canReplace, homePathFor, navigationFor, PERMISSIONS } from "@/lib/authz/policy";

describe("matriz de permisos", () => {
  it("el administrador tiene todos los permisos", () => {
    for (const p of PERMISSIONS) expect(can("ADMIN", p)).toBe(true);
  });
  it("el contratista consulta, carga y crea carpetas, pero no administra", () => {
    expect(can("CONTRACTOR", "document:upload")).toBe(true);
    expect(can("CONTRACTOR", "folder:create")).toBe(true);
    expect(can("CONTRACTOR", "history:read:own")).toBe(true);
    for (const p of ["admin:access", "users:manage", "projects:manage", "audit:read", "settings:manage", "history:read:all", "folder:rename", "folder:delete", "project:read:all"] as const) {
      expect(can("CONTRACTOR", p)).toBe(false);
    }
  });
  it("el rol de consulta no puede cargar ni crear carpetas", () => {
    expect(can("VIEWER", "project:read")).toBe(true);
    expect(can("VIEWER", "folder:read")).toBe(true);
    expect(can("VIEWER", "document:read")).toBe(true);
    expect(can("VIEWER", "document:upload")).toBe(false);
    expect(can("VIEWER", "folder:create")).toBe(false);
  });
  it("reemplazo de documentos según configuración", () => {
    expect(canReplace("ADMIN", false)).toBe(true);
    expect(canReplace("CONTRACTOR", false)).toBe(false);
    expect(canReplace("CONTRACTOR", true)).toBe(true);
    expect(canReplace("VIEWER", true)).toBe(false);
  });
  it("el menú muestra solo opciones autorizadas", () => {
    expect(navigationFor("CONTRACTOR").map((n) => n.label)).toEqual(["Inicio", "Cargar documentos", "Mis proyectos", "Historial de cargas", "Mi perfil"]);
    expect(navigationFor("VIEWER").map((n) => n.label)).toEqual(["Inicio", "Mis proyectos", "Mi perfil"]);
    expect(navigationFor("ADMIN").map((n) => n.label)).toEqual([
      "Panel de control", "Contratistas", "Solicitudes de acceso", "Proyectos", "Gestión documental", "Historial de operaciones", "Auditoría", "Configuración",
    ]);
    expect(homePathFor("ADMIN")).toBe("/admin");
    expect(homePathFor("CONTRACTOR")).toBe("/inicio");
  });
});
