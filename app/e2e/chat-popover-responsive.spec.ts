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
  await expect(page.getByTestId("hero-city-name")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId("stationary-energy")).toBeVisible({
    timeout: 30000,
  });
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

  test("long project names wrap without overflowing the loaded GHGI page", async ({
    page,
  }) => {
    const { cityId, inventoryId } = await createCityAndInventoryViaApi(
      page.request,
    );
    const projectName = "A long city climate project name ".repeat(6).trim();
    await page.route(
      new RegExp(`/api/v1/inventory/${inventoryId}/?(?:\\?.*)?$`),
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.data.city.project.name = projectName;
        await route.fulfill({ response, json: body });
      },
    );
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await dismissCookieConsent(page);
    const title = page.getByTestId("hero-project-name");
    await expect(title).toHaveText(projectName, { timeout: 30000 });
    await expect(page.getByTestId("stationary-energy")).toBeVisible({
      timeout: 30000,
    });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(async () =>
          page.evaluate(() => ({
            document: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
          })),
        )
        .toEqual({ document: width, viewport: width });
      const box = await title.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.height).toBeGreaterThan(32);
    }
  });

  test("checks document width after delayed sector data renders", async ({
    page,
  }) => {
    const { cityId, inventoryId } = await createCityAndInventoryViaApi(
      page.request,
    );
    let releaseProgress!: () => void;
    let markProgressStarted!: () => void;
    const progressGate = new Promise<void>((resolve) => {
      releaseProgress = resolve;
    });
    const progressStarted = new Promise<void>((resolve) => {
      markProgressStarted = resolve;
    });
    await page.route(
      new RegExp(`/api/v1/inventory/${inventoryId}/progress/?(?:\\?.*)?$`),
      async (route) => {
        markProgressStarted();
        await progressGate;
        await route.continue();
      },
    );
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    try {
      await dismissCookieConsent(page);
      await expect(page.getByTestId("hero-city-name")).toBeVisible({
        timeout: 30000,
      });
      await progressStarted;
      await expect(page.getByTestId("stationary-energy")).not.toBeVisible();
    } finally {
      releaseProgress();
    }
    await expect(page.getByTestId("stationary-energy")).toBeVisible({
      timeout: 30000,
    });
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        })),
      )
      .toEqual({ document: 320, viewport: 320 });
  });
});
