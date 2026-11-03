import { expect, test } from "@playwright/test";
import { fileOf, loginAs, selectDestination, USERS } from "./helpers";

test.describe("Flujo del contratista: destino, carpetas, arrastrar y soltar y carga", () => {
  test("crea una subcarpeta, arrastra varios documentos, los carga y los encuentra en el destino y en el historial", async ({ page }) => {
    await loginAs(page, USERS.abc);
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    await page.getByRole("link", { name: "Cargar documentos" }).first().click();
    await expect(page.getByRole("heading", { name: "CARGA DE DOCUMENTOS" })).toBeVisible();

    await selectDestination(page, /PI-2024-001/, "ejecucion", "2.06 Seguimiento");

    // CREAR NUEVA CARPETA con vista previa de la ruta
    const folder = `Ensayos E2E ${Date.now()}`;
    await page.getByTestId("open-create-folder").click();
    await page.getByTestId("folder-name-input").fill(folder);
    await expect(page.getByTestId("folder-target-path")).toHaveText(`/PI-2024-001 Ampliación planta de tratamiento/2. Ejecución/2.06 Seguimiento/${folder}`);
    await page.getByTestId("confirm-create-folder").click();
    await expect(page.getByTestId("destination-path")).toContainText(folder);

    // Subcarpeta anidada dentro de la nueva carpeta
    await page.getByTestId("open-create-folder").click();
    await page.getByTestId("folder-name-input").fill("Resultados mensuales");
    await page.getByTestId("confirm-create-folder").click();
    await expect(page.getByTestId("destination-path")).toContainText(`${folder}/Resultados mensuales`);

    // Arrastrar y soltar dos archivos sobre la zona de carga
    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["%PDF-1.4 informe"], "Informe de ensayo.pdf", { type: "application/pdf" }));
      dt.items.add(new File(["a;b\n1;2"], "Resultados.csv", { type: "text/csv" }));
      return dt;
    });
    const dropzone = page.getByTestId("dropzone");
    await dropzone.dispatchEvent("dragenter", { dataTransfer });
    await dropzone.dispatchEvent("drop", { dataTransfer });
    await expect(page.getByTestId("queue-item")).toHaveCount(2);

    // Agregar más archivos a la selección y retirar uno antes de cargar
    await page.getByTestId("file-input").setInputFiles([fileOf("Borrador.docx", "x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), fileOf("Planos generales.pdf", Buffer.alloc(5 * 1024 * 1024 + 77, 1))]);
    await expect(page.getByTestId("queue-item")).toHaveCount(4);
    await page.getByRole("button", { name: "Quitar Borrador.docx" }).click();
    await expect(page.getByTestId("queue-item")).toHaveCount(3);
    await expect(page.getByTestId("queue-count")).toContainText("3 documentos");

    // Vista previa del destino siempre visible
    await expect(page.getByTestId("destination-summary")).toContainText("PI-2024-001");
    await expect(page.getByTestId("destination-path")).toContainText(`2.06 Seguimiento/${folder}/Resultados mensuales`);

    await expect(page.getByTestId("upload-button")).toBeEnabled();
    await page.getByTestId("upload-button").click();
    await expect(page.getByTestId("upload-summary")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-testid="queue-item"][data-status="success"]')).toHaveCount(3);
    await expect(page.getByTestId("upload-summary")).toContainText("3");
    await expect(page.getByText("Guardado en almacenamiento de demostración").first()).toBeVisible();

    // Historial persistido
    await page.goto("/historial");
    await expect(page.getByTestId("history-table")).toContainText("Informe de ensayo.pdf");
    await expect(page.getByTestId("history-table")).toContainText("Planos generales.pdf");
    await expect(page.getByTestId("history-row").first()).toContainText("Cargado correctamente");

    // Los archivos existen en la carpeta de destino
    await page.goto("/proyectos");
    await page.getByRole("link", { name: "Ampliación planta de tratamiento" }).click();
    await page.getByRole("link", { name: "2. Ejecución" }).click();
    await page.getByRole("button", { name: "2.06 Seguimiento" }).click();
    await page.getByRole("button", { name: folder }).click();
    await page.getByRole("button", { name: "Resultados mensuales" }).click();
    await expect(page.getByTestId("browser-path")).toContainText(`${folder}/Resultados mensuales`);
    await expect(page.getByTestId("browser-row")).toHaveCount(3);
    await expect(page.getByTestId("browser-row").filter({ hasText: "Resultados.csv" })).toBeVisible();
  });

  test("detecta un duplicado y permite renombrar antes de cargar", async ({ page }) => {
    await loginAs(page, USERS.abc);
    await page.goto("/cargar");
    await selectDestination(page, /PI-2024-002/, "inicio");
    await page.getByTestId("file-input").setInputFiles([fileOf("Léame (demostración).txt", "copia", "text/plain")]);
    await expect(page.locator('[data-testid="queue-item"][data-status="conflict"]')).toHaveCount(1);
    await page.getByTestId("upload-button").click();
    await expect(page.getByTestId("conflict-item")).toBeVisible();
    await expect(page.getByTestId("conflict-new-name")).toHaveValue("Léame (demostración) (1).txt");
    await page.getByTestId("apply-conflicts").click();
    await page.getByTestId("upload-button").click();
    await expect(page.locator('[data-testid="queue-item"][data-status="success"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("queue-item")).toContainText("Léame (demostración) (1).txt");
  });

  test("rechaza archivos con extensiones no permitidas antes de cargar", async ({ page }) => {
    await loginAs(page, USERS.abc);
    await page.goto("/cargar");
    await page.getByTestId("file-input").setInputFiles([fileOf("instalador.exe", "MZ", "application/octet-stream")]);
    await expect(page.locator('[data-testid="queue-item"][data-status="invalid"]')).toContainText("no está permitida");
    await expect(page.getByTestId("upload-button")).toBeDisabled();
  });
});
