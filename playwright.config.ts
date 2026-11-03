import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas end-to-end contra la compilación de producción en MODO DEMOSTRACIÓN.
 * Requiere `npm run build` previo (lo ejecuta `npm run test:e2e`).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "movil", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3100/login",
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
