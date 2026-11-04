import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("VXLAN EVPN Lab: add the missing L3VNI on LEAF3", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/evpn/evpn-l3vni");
  const input = page.getByLabel("Console input");
  const con = page.locator(".san-con");
  const run = async (line: string) => {
    await input.fill(line);
    await input.press("Enter");
  };
  await page.getByLabel("From host").selectOption("h1");
  await page.getByLabel("To host").selectOption("h3");
  await page.getByRole("button", { name: "Ping", exact: true }).click();
  await expect(page.locator(".aci-verdict")).toContainText("no reply");

  await page.getByRole("tab", { name: "LEAF3" }).click();
  await run("show nve vni");
  await expect(con).toContainText("10020");
  await run("conf t");
  await run("int nve1");
  await run("member vni 50001 associate-vrf");
  await run("end");
  await run("show nve vni");
  await expect(con).toContainText("[TENANT1]");
  await page.getByRole("button", { name: "Ping", exact: true }).click();
  await expect(page.locator(".aci-verdict")).toContainText("reply");
  await page.getByRole("button", { name: "Check the fabric" }).click();
  await expect(page.locator(".san-goals ul")).not.toContainText("✗");
  await expect(page.locator(".fab-debrief")).toBeVisible();
  await noErrors(errs);
});
