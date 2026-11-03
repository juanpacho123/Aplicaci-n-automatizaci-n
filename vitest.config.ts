import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // "server-only" lanza una excepción fuera de un componente de servidor; en pruebas es inocuo.
  "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/env.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/env.ts"],
          globalSetup: ["tests/support/global-setup.ts"],
          // Las pruebas de integración comparten una base de datos real: se ejecutan en serie.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
