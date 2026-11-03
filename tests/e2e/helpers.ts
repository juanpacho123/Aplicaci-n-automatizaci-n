import { expect, type Page } from "@playwright/test";

export const USERS = {
  admin: "admin@portal-demo.example",
  abc: "documentos@constructoraabc.example",
  xyz: "calidad@ingenieriaxyz.example",
  viewer: "interventoria@portal-demo.example",
  suspended: "jefe.obra@montajesnorte.example",
  pending: "compras@montajesnorte.example",
};

export async function loginAs(page: Page, email: string) {
  // Cada inicio de sesión parte de un navegador sin sesión previa.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId(`demo-login-${email}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function logout(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout").click();
  await page.waitForURL("**/login");
}

export async function selectDestination(page: Page, projectLabel: RegExp, stage: "inicio" | "ejecucion" | "cierre", folder?: string) {
  const select = page.getByTestId("project-select");
  const value = await select.locator("option", { hasText: projectLabel }).getAttribute("value");
  await select.selectOption(value!);
  await page.getByTestId(`stage-${stage}`).click();
  await expect(page.getByTestId("destination-path")).toContainText(stage === "ejecucion" ? "2. Ejecución" : stage === "inicio" ? "1. Inicio" : "3. Cierre");
  if (folder) {
    await page.getByTestId("folder-entry").filter({ hasText: folder }).click();
    await expect(page.getByTestId("destination-path")).toContainText(folder);
  }
}

export function fileOf(name: string, content: string | Buffer, mimeType = "application/pdf") {
  return { name, mimeType, buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) };
}
