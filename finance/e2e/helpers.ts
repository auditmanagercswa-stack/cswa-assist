import { expect, type Page } from "@playwright/test";

export async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login").click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: /happened/ })).toBeVisible();
}
