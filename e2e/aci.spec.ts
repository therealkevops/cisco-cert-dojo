import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("ACI Policy Lab: fix a consumer relation and a filter through the forms", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/aci/aci-consume");
  await page.getByRole("button", { name: "Submit and check" }).click();
  await expect(page.locator(".san-goals ul")).toContainText("✗");

  await page.getByLabel("Add to Web Consumed contracts").selectOption("web-to-app");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("app-8080 Entries").fill("tcp 8080");

  await page.getByLabel("Source endpoint").selectOption("web01");
  await page.getByLabel("Destination endpoint").selectOption("app01");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.locator(".aci-verdict")).toContainText("permitted");

  await page.getByRole("button", { name: "Submit and check" }).click();
  await expect(page.locator(".san-goals ul")).not.toContainText("✗");
  await expect(page.locator(".fab-debrief")).toBeVisible();
  await noErrors(errs);
});

test("ACI Policy Lab: access policy faults clear as the chain is completed", async ({ page }) => {
  await page.goto("/aci/aci-access");
  await expect(page.locator(".aci-faults")).toContainText("invalid-vlan");
  await page.getByRole("button", { name: /^VLAN pools/ }).click();
  await page.getByLabel("SHOP_VLANS Encap blocks").fill("100-299");
  await expect(page.locator(".aci-faults")).toContainText("invalid-path");
});
