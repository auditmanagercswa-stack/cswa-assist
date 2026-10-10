import { execSync } from "node:child_process";

/**
 * Integration tests use a separate database and only apply migrations (non-destructive).
 * Each run creates its own company and user, so runs are isolated by tenancy — nothing is wiped.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://finance:finance@localhost:5432/finance_test?schema=public";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
