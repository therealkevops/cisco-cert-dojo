import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

test("a missed kata question links to hands-on practice", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/exam/encor/kata?o=3.2.c");
  for (let i = 0; i < 10; i++) {
    const text = page.locator(".ticket-body input[type=text], .ticket-body textarea");
    if (await text.count()) await text.first().fill("zzz");
    else if (await page.locator(".order-pool").count()) {
      while (await page.locator(".order-pool .chip").count()) await page.locator(".order-pool .chip").last().click();
    } else await page.locator(".ticket-body button, .ticket-body label").last().click();
    await page.getByRole("button", { name: "Submit" }).click();
    if (await page.locator(".verdict-hands").count()) break;
    await page.getByRole("button", { name: /Next/ }).click();
  }
  await expect(page.locator(".verdict-hands")).toContainText("Try it hands-on");
  await noErrors(errs);
});

test("hands-on progress raises objective mastery on the blueprint", async ({ page }) => {
  await page.goto("/exam/encor?o=3.2.c");
  const pct = page.locator("button.obj.on .pct");
  await expect(pct).toHaveText("0%");
  await page.evaluate(() => {
    const k = "cert-dojo:v1";
    const v = JSON.parse(localStorage.getItem(k) || '{"v":1,"cards":{},"labs":{},"mocks":[],"read":{},"wire":{},"days":[]}');
    v.wire["bgp-remote-as"] = { at: Date.now() };
    localStorage.setItem(k, JSON.stringify(v));
  });
  await page.reload();
  await expect(pct).not.toHaveText("0%");
  await expect(page.locator(".hands")).toContainText("done ✓");
});

test("a config drill can be completed by typing the commands", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/labs/ntp-auth");
  const input = page.locator(".term-line input");
  for (const l of ["enable", "configure terminal", "ntp authentication-key 1 md5 Tick70ck", "ntp authenticate", "ntp trusted-key 1", "ntp server 10.0.0.1 key 1", "end"]) {
    await input.fill(l);
    await input.press("Enter");
  }
  await expect(page.locator(".steps li.todo")).toHaveCount(0);
  await expect(page.locator(".steps li.cur")).toHaveCount(0);
  await noErrors(errs);
});

test("an NX-OS upgrade drill accepts show commands as steps", async ({ page }) => {
  const errs = watchErrors(page);
  await page.goto("/labs/nxos-upgrade");
  const input = page.locator(".term-line input");
  for (const l of [
    "dir bootflash:",
    "show install all impact nxos bootflash:nxos64-cs.10.4.3.F.bin",
    "install all nxos bootflash:nxos64-cs.10.4.3.F.bin",
    "show install all impact epld bootflash:n9000-epld.10.4.3.F.img",
    "install epld bootflash:n9000-epld.10.4.3.F.img module all",
  ]) {
    await input.fill(l);
    await input.press("Enter");
  }
  await expect(page.locator(".term-out")).toContainText("Ticket complete");
  await noErrors(errs);
});

test("the rack shows CCNP Data Center with DCCOR and DCAI", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CCNP Data Center" })).toBeVisible();
  await expect(page.locator("main")).toContainText("DCCOR");
});
