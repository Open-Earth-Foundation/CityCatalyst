import { expect, test, type Page } from "@playwright/test";

/**
 * Brazil Phase 3 demo — the proposal flow (BR-N1, BR-N6, BR-N7) end to end,
 * plus the quick fixes on the current screens. Fixture data only; every test
 * starts from a fresh browser context, so localStorage (the city's settings
 * and its own order) is empty.
 *
 * Skips itself where the HIAP_BR_DEMO flag is off (the demo route 404s), so
 * the main e2e run is unaffected.
 */

const DEMO = "/en/public/hiap/brazil-demo";
const home = (city = "sobral") => `${DEMO}/${city}/adaptation/next/`;

async function dismissOverlays(page: Page) {
  // On narrow screens the demo's "open decisions" pill overlaps the cookie
  // banner, so the click is dispatched on the button itself.
  for (const name of ["Dismiss", "Decline"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible().catch(() => false)) {
      await button.dispatchEvent("click");
    }
  }
}

async function openHome(page: Page, city = "sobral") {
  await page.goto(home(city));
  await expect(page.getByText("All actions, in order")).toBeVisible({
    timeout: 90_000,
  });
  await dismissOverlays(page);
}

/** Action names of the list, top to bottom (table or stacked rows). */
async function rowNames(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="ranked-action"]')
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.actionName ?? ""),
    );
}

function section(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator("xpath=../..");
}

test.beforeEach(async ({ page }) => {
  const res = await page.request.get(`${DEMO}/`);
  test.skip(res.status() === 404, "HIAP_BR_DEMO flag is off");
});

test.describe("BR-N1 proposal home", () => {
  test("opens on the ranking, in reading order, with no scores", async ({
    page,
  }) => {
    await openHome(page);

    const titles = [
      "Where Sobral is exposed",
      "What to do first",
      "All actions, in order",
      "How this ranking was built",
    ];
    const ys: number[] = [];
    for (const title of titles) {
      const box = await page.getByText(title, { exact: true }).boundingBox();
      expect(box, title).not.toBeNull();
      ys.push(box!.y);
    }
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);

    await expect(
      page.getByText("10 actions ranked with default settings"),
    ).toBeVisible();
    expect(await rowNames(page)).toHaveLength(10);

    // Feedback: no numbers, no rank, no priority labels, no "risk cell".
    const body = await page.locator("main, body").first().innerText();
    expect(body).not.toMatch(/Final score|Rank #|#\d+ of \d+|High priority/);
    expect(body.toLowerCase()).not.toContain("risk cell");

    // Three risks and three recommended actions.
    await expect(
      section(page, "Where Sobral is exposed").getByText(/risk$/),
    ).toHaveCount(3);
    await expect(
      section(page, "What to do first").getByRole("button", {
        name: "View details",
      }),
    ).toHaveCount(3);
  });

  test("preferences re-rank the list live", async ({ page }) => {
    await openHome(page);
    const before = await rowNames(page);

    await page
      .getByRole("button", { name: /adjust preferences/i })
      .first()
      .click();
    await page
      .getByRole("group", { name: "Co-benefits your city prioritises" })
      .getByText("Public health", { exact: true })
      .click();

    await expect(
      page.getByText("10 actions ranked with your settings"),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const now = await rowNames(page);
        return now.length === 10 && now.join() !== before.join();
      })
      .toBe(true);

    await page.getByRole("button", { name: /reset to defaults/i }).click();
    await expect.poll(() => rowNames(page)).toEqual(before);
  });

  test("filters narrow the list without changing the order", async ({
    page,
  }) => {
    await openHome(page);
    const before = await rowNames(page);

    await page.getByRole("button", { name: /^Sector/ }).click();
    await page
      .getByRole("menuitemcheckbox", { name: "Water resources" })
      .click();
    await page.keyboard.press("Escape");

    await expect(page.getByText(/of 10 match the filters/)).toBeVisible();
    const filtered = await rowNames(page);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(10);
    // Same relative order as the full list.
    expect(before.filter((n) => filtered.includes(n))).toEqual(filtered);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(() => rowNames(page)).toEqual(before);
  });

  test("the city reworks the order and it persists", async ({ page }) => {
    await openHome(page);
    const before = await rowNames(page);
    const target = before[7];

    await page
      .getByRole("button", { name: `More options for ${target}` })
      .click();
    await page.getByRole("menuitem", { name: /pin to top/i }).click();

    await expect(
      page.getByText("You moved 1 action. The list shows your order."),
    ).toBeVisible();
    expect((await rowNames(page))[0]).toBe(target);
    await expect(
      section(page, "What to do first").getByText(target, { exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText("All actions, in order")).toBeVisible();
    await dismissOverlays(page);
    expect((await rowNames(page))[0]).toBe(target);

    await page.getByRole("button", { name: "Reset to suggested" }).click();
    await expect.poll(() => rowNames(page)).toEqual(before);
  });

  test("an excluded action waits in the footnote and comes back", async ({
    page,
  }) => {
    await openHome(page);
    const before = await rowNames(page);
    const target = before[before.length - 1];

    await page
      .getByRole("button", { name: `More options for ${target}` })
      .click();
    await page.getByRole("menuitem", { name: /exclude from ranking/i }).click();

    await expect.poll(async () => (await rowNames(page)).length).toBe(9);
    const footnote = page.getByText(/actions not scored for this city/);
    await expect(footnote).toHaveText(/^3 actions/);
    await footnote.click();
    await page.getByRole("button", { name: "Include again" }).click();

    await expect.poll(() => rowNames(page)).toEqual(before);
    await expect(footnote).toHaveText(/^2 actions/);
  });

  test("the action drawer reads title, description, facts, then method", async ({
    page,
  }) => {
    await openHome(page);
    const first = (await rowNames(page))[0];
    await section(page, "What to do first")
      .getByRole("button", { name: "View details" })
      .first()
      .click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: first })).toBeVisible();
    const text = await drawer.innerText();
    const order = [
      first,
      "AT A GLANCE",
      "CO-BENEFITS AND ADVERSE EFFECTS",
      "HOW THE SCORE WAS COMPUTED",
      "WOULD YOU LIKE TO GO FURTHER?",
    ].map((s) => text.toUpperCase().indexOf(s.toUpperCase()));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // The calculation stays behind a link.
    await expect(drawer.getByText(/% weight/).first()).toBeHidden();
    await drawer.getByRole("button", { name: "Show the calculation" }).click();
    await expect(drawer.getByText(/% weight/).first()).toBeVisible();

    for (const link of [
      "Legal detail",
      "Financing options",
      "Policy evidence",
    ]) {
      await expect(drawer.getByRole("link", { name: link })).toBeVisible();
    }
  });

  test("city context opens in place with the municipal boundary", async ({
    page,
  }) => {
    await openHome(page);
    await page.getByRole("button", { name: "See the city context" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("City context · Sobral")).toBeVisible();
    // The outline needs the Global API; without network the note shows.
    await expect(
      dialog
        .getByRole("img", { name: "Municipal boundary of Sobral" })
        .or(dialog.getByText("No municipal boundary available")),
    ).toBeVisible();
    await expect(dialog.getByText("CAPAG", { exact: true })).toBeVisible();
  });

  test("the list exports to CSV and selected actions to a PDF report", async ({
    page,
  }) => {
    await openHome(page);

    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: /export csv/i }).click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toBe("hiap-brazil-demo-sobral-ranking.csv");
    const lines = (await (await csv.createReadStream()).toArray())
      .join("")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(11);

    const rows = page.locator('[data-testid="ranked-action"]');
    await rows.nth(0).getByRole("checkbox").check({ force: true });
    await rows.nth(1).getByRole("checkbox").check({ force: true });
    const pdfDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: /generate 2 reports|generate report/i })
      .click();
    expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("edge-case cities show their special cases", async ({ page }) => {
    // Santa Cruz: CAPAG not declared, shown with the funding gap.
    await openHome(page, "santa-cruz");
    await section(page, "What to do first")
      .getByRole("button", { name: "View details" })
      .first()
      .click();
    await expect(
      page.getByRole("dialog").getByText(/CAPAG not declared/),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // São Luís: the sea-level-rise action is outside AdaptaBrasil's coverage.
    await openHome(page, "sao-luis");
    await page.getByText(/actions? not scored for this city/).click();
    await expect(
      page.getByText("Strengthen coastal protection against sea-level rise"),
    ).toBeVisible();

    // Itaubal: zero malaria vulnerability takes the health action out.
    await openHome(page, "itaubal");
    const names = await rowNames(page);
    expect(names).not.toContain(
      "Strengthen healthcare capacity, continuity and environmental health surveillance",
    );
  });

  for (const width of [900, 640]) {
    test(`stacks without clipping at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openHome(page);

      // The list becomes stacked rows; no table to scroll sideways.
      await expect(page.getByRole("table")).toHaveCount(0);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      // Preferences open as a drawer.
      await page
        .getByRole("button", { name: /adjust preferences/i })
        .first()
        .click();
      await expect(
        page.getByRole("dialog").getByText("Co-benefits your city prioritises"),
      ).toBeVisible();
    });
  }
});

test.describe("BR-N7 legal, expandable", () => {
  test("sector filter narrows and a row opens on its norms", async ({
    page,
  }) => {
    await page.goto(`${DEMO}/sobral/adaptation/next/legal/`);
    await expect(
      page.getByText("Actions and the norms behind them"),
    ).toBeVisible({
      timeout: 90_000,
    });
    await dismissOverlays(page);
    await expect(page.getByText("14 actions")).toBeVisible();

    await page
      .getByRole("group", { name: "Filter by sector" })
      .getByText("Health")
      .click();
    await expect(page.getByText(/^\d actions?$/)).not.toHaveText("14 actions");

    await page
      .getByRole("button", { name: /Provide public shading in heat hotspots/ })
      .click();
    await expect(
      page.getByRole("columnheader", { name: "Norm" }),
    ).toBeVisible();
  });
});

test.describe("Quick fixes on the current screens", () => {
  test("BR-A1 uses plain wording and no AI styling", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/`);
    await expect(
      page.getByText("12 climate hazards assessed by AdaptaBrasil"),
    ).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByRole("button", { name: /set your preferences/i }),
    ).toBeVisible();
    await expect(page.getByText("in the action bank")).toBeVisible();
  });

  test("BR-A2 says hazard, filters by sector and explains H/E/V", async ({
    page,
  }) => {
    await page.goto(`${DEMO}/sobral/adaptation/risk/`);
    await expect(
      page.getByRole("heading", { name: "Twelve hazards" }),
    ).toBeVisible({
      timeout: 90_000,
    });
    await dismissOverlays(page);
    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(12);
    await page.getByText("Health", { exact: true }).first().click();
    await expect(rows).toHaveCount(4);
    expect(
      (await page.locator("body").innerText()).toLowerCase(),
    ).not.toContain("risk cell");
  });

  test("BR-A3 has select all and clear on every list", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/preferences/`);
    await expect(
      page.getByText("Preferences", { exact: true }).first(),
    ).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByRole("button", { name: "Select all" })).toHaveCount(
      4,
    );
  });
});
