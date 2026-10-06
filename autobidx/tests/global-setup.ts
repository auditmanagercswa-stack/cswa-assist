import { execSync } from "child_process";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/autobidx_test?schema=public";

/** Applies migrations to the dedicated test database once per run. */
export default function setup() {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
}
