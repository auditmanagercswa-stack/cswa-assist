// One-command local portal: starts a bundled PostgreSQL (no Docker needed), prepares the
// database, loads demo data on the first run, starts the app and opens the browser.
// Usage: node scripts/local-start.mjs [reset]
import { spawn } from "node:child_process";
import { existsSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const DB_PORT = 5433;
const APP_PORT = 3000;
const DB_URL = `postgresql://postgres:postgres@localhost:${DB_PORT}/autobidx?schema=public`;
const DATA_DIR = process.env.LOCALDB_DIR ?? path.join(root, ".localdb");
const SEEDED = path.join(root, ".localdb-seeded");
const isWin = process.platform === "win32";

const say = (m) => console.log(`  ${m}`);
const fail = (m) => {
  console.log(`\n  [X] ${m}\n`);
  process.exit(1);
};

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

function openBrowser(url) {
  const [cmd, args] = isWin ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

console.log("\n  ==================================================");
console.log("    ALPHA CARS  -  local portal");
console.log("  ==================================================\n");

if (await portOpen(APP_PORT)) {
  say(`The portal already seems to be running. Opening http://localhost:${APP_PORT}`);
  openBrowser(`http://localhost:${APP_PORT}`);
  process.exit(0);
}

// 1. Settings file
if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  say("[OK] Created settings file .env");
}

// 2. Database (bundled PostgreSQL, data kept in .localdb)
let db = null;
if (await portOpen(DB_PORT)) {
  say("[OK] Database already running.");
} else {
  say("[..] Starting the database...");
  db = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: "postgres", port: DB_PORT, persistent: true, onLog: () => {}, onError: () => {} });
  try {
    if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) await db.initialise();
    await db.start();
  } catch (e) {
    fail(`The database could not start: ${e?.message ?? e}`);
  }
  say("[OK] Database is running.");
}
const client = new pg.Client({ connectionString: `postgresql://postgres:postgres@localhost:${DB_PORT}/postgres` });
await client.connect();
const exists = await client.query("select 1 from pg_database where datname = 'autobidx'");
if (!exists.rowCount) await client.query("create database autobidx");
await client.end();

const env = { DATABASE_URL: DB_URL };
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  say("Stopping...");
  if (app && !app.killed) app.kill();
  if (db) await db.stop().catch(() => {});
  process.exit(code);
}
let app = null;
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// 3. Tables
say("[..] Preparing database tables...");
if ((await run("npx", ["prisma", "migrate", "deploy"], env)) !== 0) {
  console.log("\n  [X] Could not set up the database tables.");
  await shutdown(1);
}

// 4. Demo data (first run, or with "reset")
if (process.argv.includes("reset")) rmSync(SEEDED, { force: true });
if (!existsSync(SEEDED)) {
  say("[..] Loading demo dealers, cars and auctions. About 2 minutes...");
  if ((await run("npm", ["run", "db:seed"], env)) !== 0) {
    console.log("\n  [X] Loading demo data failed.");
    await shutdown(1);
  }
  writeFileSync(SEEDED, new Date().toISOString());
}
say("[OK] Demo data ready.");

// 5. App
console.log("\n  ==================================================");
console.log(`    Portal starting at  http://localhost:${APP_PORT}`);
console.log("    Your browser opens by itself when it is ready.");
console.log("    KEEP THIS WINDOW OPEN. Closing it stops the portal.");
console.log("");
console.log("    Demo sign-ins");
console.log("      Super Admin : admin@alphacars.in  / Admin@123");
console.log("      Seller      : seller@alphacars.in / Demo@1234");
console.log("      Buyer       : buyer@alphacars.in  / Demo@1234");
console.log("  ==================================================\n");

// Start Next directly (not through npx) so stopping this script also stops the app.
app = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(APP_PORT)], { stdio: "inherit", env: { ...process.env, ...env } });
app.on("exit", (code) => shutdown(code ?? 0));

// Open the browser once the first page has compiled.
for (let i = 0; i < 300 && !stopping; i++) {
  try {
    const r = await fetch(`http://localhost:${APP_PORT}/api/health`, { signal: AbortSignal.timeout(120000) });
    if (r.status < 500) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 2000));
}
if (!stopping) {
  await fetch(`http://localhost:${APP_PORT}/`, { signal: AbortSignal.timeout(180000) }).catch(() => {});
  openBrowser(`http://localhost:${APP_PORT}`);
}
