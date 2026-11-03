import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("vPC Lab: fix a static channel-group on the secondary", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/vpc/vpc-lacp");
  const input = page.getByLabel("Console input");
  const con = page.locator(".san-con");
  const run = async (line: string) => {
    await input.fill(line);
    await input.press("Enter");
  };
  await page.getByRole("tab", { name: "N9K-B" }).click();
  await run("show port-channel summary");
  await expect(con).toContainText("Po20(SD)");
  await page.getByRole("button", { name: "Check the pair" }).click();
  await expect(page.locator(".san-goals ul")).toContainText("✗");

  await run("conf t");
  await run("int eth1/20");
  await run("channel-group 20 mode active");
  await expect(con).toContainText("no channel-group first");
  await run("no channel-group");
  await run("channel-group 20 mode active");
  await run("end");
  await run("show vpc");
  await expect(con).toContainText("20    Po20          up");
  await page.getByRole("button", { name: "Check the pair" }).click();
  await expect(page.locator(".san-goals ul")).not.toContainText("✗");
  await expect(page.locator(".fab-debrief")).toBeVisible();
  await noErrors(errs);
});
