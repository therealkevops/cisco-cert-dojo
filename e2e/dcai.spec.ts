import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("Fabric Lab: enabling ECN on every switch fixes the victim job", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/fabric/fab-ecn");
  await expect(page.locator(".fab-jobs")).toBeVisible();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".fab-goals ul")).toContainText("✗");
  await page.locator(".fab-field", { hasText: "ECN marking" }).locator("button").click();
  await page.getByRole("button", { name: "Apply these settings to every switch" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".fab-goals ul")).not.toContainText("✗");
  await expect(page.locator(".fab-debrief")).toBeVisible();
  await noErrors(errs);
});

test("UCS Profile Lab: build a RoCE-ready profile through the UI", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/ucs/ucs-roce");
  const card = (t: string) => page.locator(".ucs-card", { hasText: t });
  await card("VLAN policy").locator("input").fill("300");
  await card("VLAN policy").getByRole("button", { name: "Add" }).click();
  await card("NTP policy").locator("input").fill("10.0.0.1");
  await card("NTP policy").getByRole("button", { name: "Add" }).click();
  const plat = card("System QoS").locator("tr", { hasText: "Platinum" });
  await plat.locator("button").nth(0).click();
  await plat.locator("button").nth(1).click();
  await plat.locator("select").nth(1).selectOption("9216");
  await card("Ethernet adapter policies").locator("input").fill("RoCE-v2");
  await card("Ethernet adapter policies").getByRole("button", { name: "Create policy" }).click();
  const ad = page.locator(".ucs-adapter", { hasText: "RoCE-v2" });
  await ad.locator(".ucs-field", { hasText: "RDMA" }).locator("button").click();
  await ad.locator(".ucs-field", { hasText: "Class of service" }).locator("select").selectOption("5");
  const v = page.locator(".ucs-vnic", { hasText: "eth-roce" });
  await v.locator(".ucs-field", { hasText: "MTU" }).locator("select").selectOption("9000");
  await v.locator(".ucs-field", { hasText: "Ethernet QoS" }).locator("select").selectOption("platinum");
  await v.locator(".ucs-field", { hasText: "adapter" }).locator("select").selectOption("RoCE-v2");
  await expect(page.locator(".ucs-ok")).toBeVisible();
  await page.getByRole("button", { name: "Deploy and check" }).click();
  await expect(page.locator(".fab-goals ul")).not.toContainText("✗");
  await noErrors(errs);
});

test("Sizing Desk: a worksheet can be signed off", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/sizing/size-fabric-256");
  const answers = ["8", "32", "8", "4", "512", "1,024"];
  const steps = page.locator(".size-step");
  for (let i = 0; i < answers.length; i++) {
    await steps.nth(i).locator("input").fill(answers[i]);
    await steps.nth(i).locator("input").press("Enter");
  }
  await expect(page.locator(".size-done")).toContainText("Design signed off");
  await noErrors(errs);
});

test("Cluster builder flags a design that outgrows two tiers", async ({ page }) => {
  await page.goto("/sizing/builder");
  await page.locator("label.build-field", { hasText: /^GPUs/ }).first().locator("input").fill("4096");
  await expect(page.locator(".build-card").first()).toContainText("Too big for two tiers");
});

test("Desk: JSON steps explain type errors, then accept the right payload", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/desk/desk-json");
  const step = page.locator(".size-step").first();
  await step.locator("textarea").fill('{"name": "GigabitEthernet1", "description": "Uplink to core", "enabled": "true", "mtu": 9000}');
  await step.getByRole("button", { name: /Check/ }).click();
  await expect(step.locator(".size-problems")).toContainText("enabled should be a boolean");
  await step.locator("textarea").fill('{"name": "GigabitEthernet1", "description": "Uplink to core", "enabled": true, "mtu": 9000}');
  await step.getByRole("button", { name: /Check/ }).click();
  await expect(step.locator(".size-mark")).toHaveText("✓");
  await noErrors(errs);
});
