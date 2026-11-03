import { expect, test } from "@playwright/test";
import { loginAs, selectDestination, USERS } from "./helpers";

test.describe("Experiencia móvil", () => {
  test("navegación por menú lateral y carga utilizable sin desplazamiento horizontal", async ({ page }) => {
    await loginAs(page, USERS.abc);
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Cargar documentos" }).click();
    await expect(page.getByRole("heading", { name: "CARGA DE DOCUMENTOS" })).toBeVisible();
    await selectDestination(page, /PI-2024-001/, "cierre", "Dossier");
    await expect(page.getByTestId("upload-button")).toBeVisible();
    await expect(page.getByTestId("destination-summary")).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const path of ["/historial", "/proyectos", "/perfil"]) {
      await page.goto(path);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(o, path).toBeLessThanOrEqual(1);
    }
  });
});
