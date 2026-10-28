import { test, expect, type Page } from "@playwright/test";
import { createCityAndInventoryViaApi, dismissCookieConsent } from "./helpers";

async function openPopover(page: Page) {
  const { cityId, inventoryId } = await createCityAndInventoryViaApi(
    page.request,
  );
  await page.addInitScript(() => {
    localStorage.setItem("clima-ai-disclaimer-accepted", "true");
  });
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
  await dismissCookieConsent(page);
  const trigger = page.locator("[data-ai-button]");
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.press("Enter");
  const popover = page.locator(
    '[data-scope="popover"][data-part="content"][data-state="open"]',
  );
  await expect(popover).toBeVisible();
  await popover.evaluate(async (element) => {
    const animations: Animation[] = [];
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      animations.push(...current.getAnimations());
    }
    await Promise.all(
      animations
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await expect
    .poll(async () =>
      popover.evaluate((element) =>
        Math.abs(
          element.getBoundingClientRect().width -
            (element as HTMLElement).offsetWidth,
        ),
      ),
    )
    .toBeLessThan(1);
  return popover;
}

test.describe("Clima Chat Popover Responsive Design", () => {
  test.setTimeout(60_000);

  test("popover fits within mobile viewport at 390px width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const popover = await openPopover(page);
    const box = await popover.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(358);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test("popover maintains 533px width at desktop viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const popover = await openPopover(page);
    await expect
      .poll(async () => (await popover.boundingBox())?.width)
      .toBe(533);
  });

  test("mobile controls are reachable without horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const popover = await openPopover(page);
    const close = popover.getByRole("button", { name: /close/i });
    const send = popover.getByRole("button", { name: /send message/i });
    for (const control of [close, send]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(popover).toBeHidden();
  });
});
