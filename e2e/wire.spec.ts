import { expect, test } from "@playwright/test";
import { noErrors, openConsole, type, verifyAllPass, watchErrors } from "./helpers";

test("HSRP: tracking plus preempt moves the gateway to R2", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/wire/hsrp-track");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".bench-goals ul")).toContainText("✕");
  await openConsole(page, "R1");
  await type(page, ["en", "conf t", "int gi0/0", "standby 10 track gi0/1 decrement 20", "end"]);
  await openConsole(page, "R2");
  await type(page, ["en", "conf t", "int gi0/0", "standby 10 preempt", "end", "show standby brief"]);
  await expect(page.locator(".con-out, .dock").first()).toContainText("Active");
  await page.keyboard.press("Escape");
  await verifyAllPass(page);
  await noErrors(errs);
});

test("BGP: AS-path prepending moves inbound traffic to ISP-B", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/wire/bgp-inbound");
  await openConsole(page, "R1");
  await type(page, ["en", "conf t", "route-map PREPEND permit 10", "set as-path prepend 65001 65001", "exit", "router bgp 65001", "neighbor 192.0.2.2 route-map PREPEND out", "end"]);
  await page.keyboard.press("Escape");
  await verifyAllPass(page);
  await noErrors(errs);
});

test("DHCP relay: the remote PC gets a lease", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/wire/dhcp-relay");
  await openConsole(page, "BR");
  await type(page, ["en", "conf t", "int g0/1", "ip helper-address 10.0.0.1", "end"]);
  await openConsole(page, "PCB1");
  await type(page, ["ip dhcp"]);
  await page.keyboard.press("Escape");
  await verifyAllPass(page);
  await noErrors(errs);
});

test("EIGRP: raising delay moves the successor to R2", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/wire/eigrp-metric");
  await openConsole(page, "R1");
  await type(page, ["en", "conf t", "int gi0/2", "delay 100", "end", "show ip eigrp topology"]);
  await expect(page.locator(".dock")).toContainText("feasible successor");
  await page.keyboard.press("Escape");
  await verifyAllPass(page);
  await noErrors(errs);
});

test("Router-on-a-stick: fixing the encapsulation restores VLAN 20", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/wire/roas-encap");
  await openConsole(page, "R1");
  await type(page, ["en", "conf t", "interface gi0/0.20", "encapsulation dot1q 20", "end"]);
  await page.keyboard.press("Escape");
  await verifyAllPass(page);
  await noErrors(errs);
});
