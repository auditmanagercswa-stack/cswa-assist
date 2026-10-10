import { expect, test } from "@playwright/test";
import { loginDemo } from "./helpers";

test("mobile: bottom tab bar replaces the sidebar", async ({ page }) => {
  await loginDemo(page);
  const tabs = page.getByRole("navigation", { name: "Main" }).filter({ hasText: "More" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More sections" }).getByRole("link", { name: "GST" }).click();
  await expect(page).toHaveURL(/\/gst/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
