import { expect, test } from "@playwright/test";
import { loginAs, logout, USERS } from "./helpers";

test.describe("Administración", () => {
  test("registra un contratista con su correo, le asigna un proyecto y luego lo suspende", async ({ page }) => {
    const email = `e2e.${Date.now()}@contratista-e2e.example`;
    await loginAs(page, USERS.admin);
    await expect(page.getByRole("heading", { name: "Panel de control" })).toBeVisible();
    await page.getByRole("link", { name: "Contratistas" }).first().click();
    await page.getByTestId("open-create-user").click();
    await page.getByTestId("user-fullname").fill("Contratista E2E");
    await page.getByTestId("user-email").fill(email);
    await page.getByLabel("Tipo de empresa").selectOption("new");
    await page.getByTestId("user-new-company").fill(`Empresa E2E ${Date.now()}`);
    await page.getByTestId("project-check-PI-2025-004").check();
    await page.getByTestId("submit-create-user").click();
    await expect(page.getByText("Acceso autorizado")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar" }).first().click();

    await page.getByRole("searchbox").or(page.getByPlaceholder("Buscar por nombre, correo o empresa")).fill(email);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("link", { name: "Contratista E2E" }).click();
    await expect(page.getByText(email).first()).toBeVisible();

    // El nuevo contratista ve solo el proyecto asignado
    await logout(page);
    await loginAs(page, email);
    const projects = await (await page.request.get("/api/projects")).json();
    expect(projects.projects.map((p: { code: string }) => p.code)).toEqual(["PI-2025-004"]);
    await logout(page);

    // Suspensión
    await loginAs(page, USERS.admin);
    await page.goto(`/admin/contratistas?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: "Contratista E2E" }).click();
    await page.getByTestId("suspend-user").click();
    await page.getByTestId("status-reason").fill("Finalización de contrato (prueba E2E)");
    await page.getByRole("button", { name: "Suspender acceso" }).last().click();
    await expect(page.getByTestId("reactivate-user")).toBeVisible();
    await logout(page);
    await page.getByTestId(`demo-login-${email}`).click();
    await expect(page).toHaveURL(/acceso-denegado\?motivo=SUSPENDED/);
  });

  test("una solicitud pública de acceso queda pendiente para el administrador", async ({ page }) => {
    const email = `solicitud.${Date.now()}@e2e.example`;
    await page.goto("/solicitar-acceso");
    await page.getByLabel(/Nombre completo/).fill("Solicitante E2E");
    await page.getByLabel(/Empresa/).fill("Eléctricas E2E");
    await page.getByLabel(/Correo electrónico/).fill(email);
    await page.getByLabel(/Proyecto solicitado/).fill("PI-2024-002");
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(page.getByTestId("request-submitted")).toBeVisible();
    const code = (await page.getByTestId("tracking-code").textContent())!.trim();
    expect(code.length).toBeGreaterThan(10);
    await page.goto("/solicitar-acceso/estado");
    await page.getByLabel("Código de seguimiento").fill(code);
    await page.getByRole("button", { name: "Consultar" }).click();
    await expect(page.getByTestId("request-status")).toContainText("Pendiente de revisión");

    await loginAs(page, USERS.admin);
    await page.getByRole("link", { name: /Solicitudes de acceso/ }).click();
    await expect(page.getByTestId("requests-list")).toContainText(email);
    // Registrar la solicitud no creó ningún usuario
    const users = await (await page.request.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).json();
    expect(users.total).toBe(0);
  });

  test("el administrador verifica la estructura documental de un proyecto", async ({ page }) => {
    await loginAs(page, USERS.admin);
    await page.goto("/admin/proyectos");
    await page.getByTestId("admin-project-row").filter({ hasText: "PI-2025-003" }).getByRole("link").click();
    await page.getByTestId("verify-structure").click();
    await expect(page.getByTestId("structure-report")).toContainText("2.08 Plan de calidad");
    await expect(page.getByTestId("structure-report")).toContainText("No existe");
  });

  test("la auditoría registra los accesos", async ({ page }) => {
    await loginAs(page, USERS.admin);
    await page.goto("/admin/auditoria?category=AUTH");
    await expect(page.getByTestId("audit-table")).toContainText("Inicio de sesión");
  });
});
