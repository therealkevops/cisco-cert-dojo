import { expect, test } from "@playwright/test";
import { noErrors, watchErrors } from "./helpers";

// Every top-level area renders without page or console errors.
const pages = [
  ["/", "rack"],
  ["/exam/encor", "blueprint"],
  ["/exam/dcai", "blueprint"],
  ["/exam/encor/kata", "kata"],
  ["/exam/dcai/mock", "mock"],
  ["/labs", "drills"],
  ["/labs/eigrp-named", "drill"],
  ["/wire", "wire sandbox"],
  ["/wire/challenges", "wire list"],
  ["/fabric", "fabric list"],
  ["/fabric/fabric", "fabric sandbox"],
  ["/sizing", "sizing list"],
  ["/sizing/builder", "cluster builder"],
  ["/desk", "desk list"],
  ["/ucs", "ucs list"],
] as const;

for (const [path, what] of pages) {
  test(`${what} renders (${path})`, async ({ page }) => {
    const errs = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    // Pages render a <main>; the full-screen Wire Room canvas renders its own shell.
    await expect(page.locator("main, .bench").first()).toBeVisible();
    await page.waitForTimeout(400);
    await noErrors(errs);
  });
}

test("command line opens with ':'", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press(":");
  await expect(page.locator(".cmdbar input")).toBeFocused();
});
