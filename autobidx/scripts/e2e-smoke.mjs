// End-to-end smoke test in a real browser against a running dev/prod server with seed data.
// Usage: node scripts/e2e-smoke.mjs   (BASE=http://localhost:3000)
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "fs";

const base = process.env.BASE ?? "http://localhost:3000";
const dir = "/opt/pw-browsers";
const chromeDir = existsSync(dir) ? readdirSync(dir).find((d) => d.startsWith("chromium-") && !d.includes("headless")) : null;
const exe = chromeDir ? [`${dir}/${chromeDir}/chrome-linux/chrome`, `${dir}/${chromeDir}/chrome-linux64/chrome`].find(existsSync) : undefined;
const browser = await chromium.launch({ executablePath: exe });
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, String(e).split("\n")[0]]);
  }
};

async function login(page, email, password) {
  await page.goto(base + "/login");
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

const buyerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobile bidding
const buyer = await buyerCtx.newPage();
await step("buyer signs in", () => login(buyer, "buyer@autobidx.in", "Demo@1234"));

await step("buyer places a bid from the mobile auction room", async () => {
  await buyer.goto(base + "/auctions");
  const href = await buyer.locator('a:has-text("Bid Now")').first().getAttribute("href");
  await buyer.goto(base + href);
  const btn = buyer.getByRole("button", { name: /PLACE BID|YOU'RE WINNING/ });
  await btn.waitFor();
  if ((await btn.textContent()).includes("WINNING")) return; // already leading
  await btn.click();
  await buyer.getByRole("dialog").getByText("If you win at this price").waitFor();
  await buyer.getByRole("dialog").getByText("Total buyer payable").waitFor({ timeout: 10000 });
  await buyer.getByRole("dialog").getByRole("button", { name: /^Bid ₹/ }).click();
  await buyer.getByText(/Bid placed/).first().waitFor({ timeout: 15000 });
});

await step("live update reaches a second viewer via SSE", async () => {
  const viewer = await browser.newPage();
  await viewer.goto(buyer.url());
  await viewer.getByText("real-time").waitFor({ timeout: 15000 });
  await viewer.close();
});

await step("buyer pays a pending order through the sandbox gateway", async () => {
  await buyer.goto(base + "/dashboard/orders?side=buying");
  await buyer.getByRole("heading", { name: "Orders & Transactions" }).waitFor();
  const pay = buyer.locator("a:visible", { hasText: "Pay now" }).first();
  if (!(await pay.count())) throw new Error(`no order awaiting payment at ${buyer.url()} — reseed the demo data (npm run db:seed)`);
  await pay.click();
  await buyer.waitForURL(/\/checkout\//);
  await buyer.getByText("Total buyer payable").waitFor();
  await buyer.getByRole("button", { name: /^Pay ₹/ }).click();
  await buyer.waitForURL(/\/pay\/mock\//);
  await buyer.getByRole("button", { name: "Simulate successful payment" }).click();
  await buyer.waitForURL(/\/dashboard\/orders\/.+payment=paid/, { timeout: 20000 });
  await buyer.getByText("Payment successful and verified").waitFor();
});

const sellerCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const seller = await sellerCtx.newPage();
await step("seller confirms a paid sale", async () => {
  await login(seller, "seller@autobidx.in", "Demo@1234");
  await seller.goto(base + "/dashboard/orders?side=selling");
  await seller.getByRole("heading", { name: "Orders & Transactions" }).waitFor();
  const hrefs = await seller.locator("table a", { hasText: "Details" }).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  for (const href of hrefs) {
    await seller.goto(base + href);
    await seller.getByText("Order progress").waitFor(); // dashboard pages stream behind a loading skeleton
    const confirm = seller.getByRole("button", { name: "Confirm sale" });
    if (await confirm.count()) {
      await confirm.click();
      await seller.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
      await seller.getByText("Order updated").first().waitFor({ timeout: 15000 });
      return;
    }
  }
  throw new Error("no order awaiting seller confirmation");
});

const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const admin = await adminCtx.newPage();
await step("admin approves a pending listing", async () => {
  await login(admin, "admin@autobidx.in", "Admin@123");
  await admin.goto(base + "/admin/vehicles?status=PENDING_APPROVAL");
  await admin.getByRole("button", { name: "Approve" }).first().click();
  await admin.getByText("Listing approved").first().waitFor({ timeout: 15000 });
});

await step("seller cannot open the admin panel", async () => {
  await seller.goto(base + "/admin");
  if (!seller.url().includes("/dashboard")) throw new Error("seller reached " + seller.url());
});

await browser.close();
for (const r of results) console.log(r.join("  "));
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
