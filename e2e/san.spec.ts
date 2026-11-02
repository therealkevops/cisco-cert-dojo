import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("SAN Lab: fix a VSAN 20 trunk from the MDS consoles", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/san/san-trunk");
  const input = page.getByLabel("Console input");
  const con = page.locator(".san-con");
  const run = async (line: string) => {
    await input.fill(line);
    await input.press("Enter");
  };
  await run("show interface fc1/13");
  await expect(con).toContainText("Trunk vsans (admin allowed and active) (1,10)");
  await page.getByRole("button", { name: "Check the fabric" }).click();
  await expect(page.locator(".san-goals ul")).toContainText("✗");

  for (const sw of ["MDS-CORE", "MDS-EDGE"]) {
    await page.getByRole("tab", { name: sw }).click();
    await run("conf t");
    await run("int fc1/13");
    await run("switchport trunk allowed vsan add 20");
    await run("end");
  }
  await run("show fcns database vsan 20");
  await expect(con).toContainText("Total number of entries = 2");
  await page.getByRole("button", { name: "Check the fabric" }).click();
  await expect(page.locator(".san-goals ul")).not.toContainText("✗");
  await expect(page.locator(".fab-debrief")).toBeVisible();
  await noErrors(errs);
});

test("SAN Lab: ? help and invalid input", async ({ page }) => {
  await page.goto("/san/san-zoneset");
  const input = page.getByLabel("Console input");
  await input.fill("show zo");
  await input.press("?");
  await expect(page.locator(".san-con")).toContainText("zoneset");
  await input.fill("zonset activate");
  await input.press("Enter");
  await expect(page.locator(".san-con")).toContainText("% Invalid command");
});
