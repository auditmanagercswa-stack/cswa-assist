// Start script for a hosted demo (e.g. Render). Applies migrations, loads demo data when the
// database is empty or the uploaded/demo images are missing (free hosts wipe the disk on restart),
// then starts the production server on $PORT.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const storage = process.env.STORAGE_DIR || "./storage";
const port = process.env.PORT || "3000";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
  });
}

await run("npx", ["prisma", "migrate", "deploy"]);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('select count(*)::int as n from "Vehicle"');
await client.end();

if (rows[0].n === 0 || !existsSync(path.join(storage, "seed"))) {
  console.log("Loading demo data...");
  await run("npx", ["tsx", "prisma/seed.ts"]);
}

const next = spawn("npx", ["next", "start", "-p", port], { stdio: "inherit", env: process.env });
next.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => next.kill(sig));
