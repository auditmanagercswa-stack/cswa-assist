import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://finance:finance@localhost:5432/finance_test?schema=public";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    env: { DATABASE_URL: TEST_DB },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
