import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("Mock exam: a sitting survives a reload, then scores with a study plan", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/exam/dccor/mock");
  await expect(page.getByRole("heading", { name: "Readiness by domain" })).toBeVisible();
  await expect(page.locator(".mock-plan li").first()).toBeVisible();

  await page.getByRole("radio", { name: "20", exact: true }).click();
  await page.getByRole("button", { name: /Start exam/ }).click();
  await expect(page.getByText("Item 1 of 20")).toBeVisible();
  // Answer the first item whatever its type, then move on.
  const text = page.locator(".ticket-body input[type=text], .ticket-body textarea");
  if (await text.count()) await text.first().fill("show version");
  else if (await page.locator(".order-pool .chip").count()) await page.locator(".order-pool .chip").first().click();
  else await page.locator(".ticket-body label, .ticket-body button").first().click();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Item 2 of 20")).toBeVisible();

  await page.reload();
  await expect(page.locator(".mock-resume")).toContainText("Unfinished mock");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Item 2 of 20")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "End exam" }).click();
  await expect(page.locator(".score-big")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Study next" })).toBeVisible();
  await expect(page.locator(".mock-plan li").first()).toBeVisible();
  await page.getByRole("radio", { name: /^all/ }).click();
  await expect(page.locator(".ticket")).toHaveCount(20);

  await page.getByRole("button", { name: "New sitting" }).click();
  await expect(page.locator(".mock-resume")).toHaveCount(0);
  await noErrors(errs);
});
