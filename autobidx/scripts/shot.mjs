// Dev tool: screenshot pages. Usage: node scripts/shot.mjs <outdir> <path> [path...]  (env: LOGIN=email:password, MOBILE=1)
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "fs";
const [outDir, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const dir = "/opt/pw-browsers";
const chromeDir = readdirSync(dir).find((d) => d.startsWith("chromium-") && !d.includes("headless"));
const exe = [`${dir}/${chromeDir}/chrome-linux/chrome`, `${dir}/${chromeDir}/chrome-linux64/chrome`].find(existsSync);
const browser = await chromium.launch({ executablePath: exe });
const mobile = !!process.env.MOBILE;
const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
if (process.env.LOGIN) {
  const [email, password] = process.env.LOGIN.split(":");
  await page.goto(base + "/login");
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}
for (const p of paths) {
  const res = await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => ({ status: () => String(e) }));
  await page.waitForTimeout(400);
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.screenshot({ path: `${outDir}/${name}${mobile ? "_m" : ""}.png`, fullPage: !!process.env.FULL });
  console.log(p, res?.status?.());
}
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].slice(0, 15).join("\n"));
await browser.close();
