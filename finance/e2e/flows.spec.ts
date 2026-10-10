import { expect, test } from "@playwright/test";
import { loginDemo } from "./helpers";

test.describe("key flows", () => {
  test.beforeEach(async ({ page }) => loginDemo(page));

  test("chat → draft → post → appears in recent entries, then undo", async ({ page }) => {
    const note = `Paid office rent ₹${(25000 + Math.floor(Math.random() * 900)).toLocaleString("en-IN")} from HDFC Bank for October`;
    await page.getByTestId("record-input").fill(note);
    await page.getByTestId("draft-button").click();
    const card = page.getByTestId("draft-card");
    await expect(card).toBeVisible();
    await expect(card.getByText(/balanced/)).toBeVisible();
    await page.getByTestId("post-entry").click();
    await expect(page.getByText(/^Posted PMT\//)).toBeVisible();
    const row = page.locator("section[aria-labelledby=recent-title] li").filter({ hasText: "Paid office rent" }).first();
    await expect(row.getByText(/PMT\/\d{2}-\d{2}\//)).toBeVisible();
    await row.getByRole("button", { name: "Undo entry" }).click();
    await expect(page.getByText(/^Reversed with PMT\//)).toBeVisible();
  });

  test("create a GST invoice and open its PDF", async ({ page }) => {
    await page.goto("/invoices/new");
    await page.getByTestId("invoice-customer").selectOption({ label: "Konkan Foods LLP" });
    await page.getByLabel("Item description").fill("Corrugated boxes");
    await page.getByLabel("Quantity").fill("500");
    await page.getByLabel("Rate", { exact: true }).fill("42");
    await expect(page.getByText("Intra-state supply")).toBeVisible();
    await page.getByTestId("create-invoice").click();
    await page.waitForURL(/\/invoices\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /INV\/\d{2}-\d{2}\// })).toBeVisible();
    const pdf = await page.request.get(page.url().replace("/invoices/", "/api/invoices/") + "/pdf");
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  });

  test("ask your books", async ({ page }) => {
    await page.goto("/ask");
    await page.getByTestId("ask-input").fill("Who owes me the most?");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ask-answer").first()).toContainText(/owes you the most|Nobody|No customer/);
  });

  test("reports export to PDF and Excel", async ({ page }) => {
    await page.goto("/reports/tb");
    await expect(page.getByRole("heading", { name: "Trial Balance" })).toBeVisible();
    const pdf = await page.request.get("/api/reports/tb?format=pdf");
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(pdf.status()).toBe(200);
    const xlsx = await page.request.get("/api/reports/pl?format=xlsx");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("signed-out visitors are sent to login", async ({ page, context }) => {
    // Auditor read-only rules are covered in tests/posting.test.ts (demo login is the owner).
    await expect(page.getByTestId("record-input")).toBeVisible();
    await context.clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
