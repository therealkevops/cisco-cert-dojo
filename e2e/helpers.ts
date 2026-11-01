import { expect, type Page } from "@playwright/test";

/** Fail the test on any uncaught page error or console error. */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

export async function noErrors(errs: string[]) {
  expect(errs, errs.join("\n")).toEqual([]);
}

/** Open a device console on the Wire Room canvas by double-clicking it. */
export async function openConsole(page: Page, name: string) {
  const box = await page.locator(".bench-dev", { hasText: new RegExp("^" + name) }).first().boundingBox();
  if (!box) throw new Error(`device ${name} not on screen`);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.35);
  await expect(page.locator(".dock-tab", { hasText: name })).toBeVisible();
}

export async function type(page: Page, lines: string[]) {
  const input = page.locator(".con-line input");
  for (const l of lines) {
    await input.fill(l);
    await input.press("Enter");
  }
}

export async function verifyAllPass(page: Page) {
  await page.getByRole("button", { name: "Verify" }).click();
  const items = page.locator(".bench-goals ul li");
  await expect(items.first()).toBeVisible();
  await expect(page.locator(".bench-goals ul")).not.toContainText("✕");
}
