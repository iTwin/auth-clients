import { test, expect } from "@playwright/test";

test("it triggers a popup when clicked", async ({ page }) => {
  await page.goto("http://localhost:3000");
  const popupPromise = page.waitForEvent("popup");
  const el = await page.getByText("Sign In");
  await el.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(await popup.title()).toEqual("IMS OIDC SIGN IN");
});
