import { expect, test } from "@playwright/test";
import { loginAs, USERS } from "./helpers";

test.describe("Seguridad y autorización en la interfaz", () => {
  test("sin sesión, las páginas protegidas redirigen al inicio de sesión", async ({ page }) => {
    await page.goto("/cargar");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fcargar/);
    const res = await page.request.get("/api/projects");
    expect(res.status()).toBe(401);
  });

  test("un contratista no puede acceder al panel administrativo", async ({ page }) => {
    await loginAs(page, USERS.abc);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).not.toContainText("Panel de control");
    await page.goto("/admin/contratistas");
    await expect(page).toHaveURL(/acceso-denegado\?motivo=FORBIDDEN/);
    const res = await page.request.get("/api/admin/users");
    expect(res.status()).toBe(403);
  });

  test("el contratista solo ve sus proyectos en el selector", async ({ page }) => {
    await loginAs(page, USERS.abc);
    await page.goto("/cargar");
    const options = await page.getByTestId("project-select").locator("option").allTextContents();
    expect(options.some((o) => o.includes("PI-2024-001"))).toBe(true);
    expect(options.some((o) => o.includes("PI-2025-004"))).toBe(false);
    // Manipular el identificador de un proyecto ajeno desde el navegador
    const projects = await (await page.request.get("/api/projects")).json();
    expect(projects.projects.map((p: { code: string }) => p.code).sort()).toEqual(["PI-2024-001", "PI-2024-002", "PI-2025-003"]);
  });

  test("intentar crear una carpeta en un proyecto ajeno desde la API es rechazado", async ({ page }) => {
    await loginAs(page, USERS.xyz);
    const own = await (await page.request.get("/api/projects")).json();
    expect(own.projects).toHaveLength(1);
    await loginAs(page, USERS.admin);
    const all = await (await page.request.get("/api/projects")).json();
    const foreign = all.projects.find((p: { code: string }) => p.code === "PI-2025-004");
    await loginAs(page, USERS.xyz);
    const csrf = (await page.context().cookies()).find((c) => c.name === "pgd_csrf")!.value;
    const res = await page.request.post(`/api/projects/${foreign.id}/folders`, { data: { parentItemId: "x", name: "Intrusa" }, headers: { "x-csrf-token": csrf, origin: "http://localhost:3100" } });
    expect(res.status()).toBe(403);
  });

  test("un usuario suspendido no puede ingresar", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId(`demo-login-${USERS.suspended}`).click();
    await expect(page).toHaveURL(/acceso-denegado\?motivo=SUSPENDED/);
    await expect(page.getByTestId("denied-reason")).toContainText("suspendido");
  });

  test("el rol de consulta no tiene opción de carga y no puede abrirla", async ({ page }) => {
    await loginAs(page, USERS.viewer);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).not.toContainText("Cargar documentos");
    await page.goto("/cargar");
    await expect(page).toHaveURL(/acceso-denegado/);
  });
});
