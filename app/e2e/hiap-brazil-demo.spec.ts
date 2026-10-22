import { expect, test, type Page } from "@playwright/test";

/**
 * Brazil Phase 3 demo — the adaptation flow (BR-N1, N2, N6–N10) end to end,
 * the previous version kept under /adaptation/previous/, and Portuguese. Fixture data only; every test
 * starts from a fresh browser context, so localStorage (the city's settings
 * and its own order) is empty.
 *
 * Skips itself where the HIAP_BR_DEMO flag is off (the demo route 404s), so
 * the main e2e run is unaffected.
 */

const DEMO = "/en/public/hiap/brazil-demo";
const home = (city = "sobral") => `${DEMO}/${city}/adaptation/`;

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

    await page.getByRole("button", { name: /reset all preferences/i }).click();
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

    await expect(page.getByText(/^Showing \d of 10/)).toBeVisible();
    const filtered = await rowNames(page);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(10);
    // Same relative order as the full list.
    expect(before.filter((n) => filtered.includes(n))).toEqual(filtered);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(() => rowNames(page)).toEqual(before);
  });

  test("facets show live counts, disable dead ends, and live in the URL", async ({
    page,
  }) => {
    await openHome(page);

    // Pick "Medium cost": the list shrinks to exactly the count the option showed.
    // (Low cost is a shortcut chip of its own; see decision C1.)
    await page.getByRole("button", { name: /^Cost/ }).click();
    const medium = page.getByRole("menuitemcheckbox", { name: /^Medium cost/ });
    const mediumCount = Number(
      (await medium.innerText()).match(/(\d+)\s*$/)![1],
    );
    expect(mediumCount).toBeGreaterThan(0);
    await medium.click();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => (await rowNames(page)).length)
      .toBe(mediumCount);
    await expect(page).toHaveURL(/[?&]cost=medium/);
    await expect(
      page.getByRole("button", { name: /Remove filter Cost: Medium cost/ }),
    ).toBeVisible();
    await expect(
      page.getByText(`Showing ${mediumCount} of 10`, { exact: false }),
    ).toBeVisible();

    // With medium cost on, sectors that would leave nothing are disabled.
    await page.getByRole("button", { name: /^Sector/ }).click();
    expect(
      await page.getByRole("menuitemcheckbox", { disabled: true }).count(),
    ).toBeGreaterThan(0);
    await page.keyboard.press("Escape");

    // The view survives a reload, because it lives in the URL.
    await page.reload();
    await expect(page.getByText("All actions, in order")).toBeVisible();
    await dismissOverlays(page);
    await expect
      .poll(async () => (await rowNames(page)).length)
      .toBe(mediumCount);

    // Removing the chip restores the full list and cleans the URL.
    await page
      .getByRole("button", { name: /Remove filter Cost: Medium cost/ })
      .click();
    await expect.poll(async () => (await rowNames(page)).length).toBe(10);
    await expect(page).not.toHaveURL(/cost=/);
  });

  test("a shared link opens the same filtered view", async ({ page }) => {
    await page.goto(`${home()}?level=high`);
    await expect(page.getByText("All actions, in order")).toBeVisible({
      timeout: 90_000,
    });
    await dismissOverlays(page);
    // High risk is a shortcut: the link turns it on.
    await expect(
      page
        .getByTestId("priority-shortcuts")
        .getByRole("button", { name: /Reduces a high risk/ }),
    ).toHaveAttribute("aria-pressed", "true");
    const names = await rowNames(page);
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(10);
    for (const text of await page.getByTestId("action-risk").allInnerTexts())
      expect(text).toMatch(/High/);
  });

  test("sorting by risk level puts high-risk actions first", async ({
    page,
  }) => {
    await openHome(page);
    await page.getByRole("button", { name: /^Sort by/ }).click();
    await page
      .getByRole("menuitemradio", { name: /Risk level, highest first/ })
      .click();
    await expect(
      page.getByTestId("ranked-action").first().getByTestId("action-risk"),
    ).toContainText("High");
  });

  test("every assessment column explains itself", async ({ page }) => {
    await openHome(page);
    for (const tip of [
      "Indicative investment band: low, medium or high.",
      "How strongly federal adaptation policy backs the action.",
    ]) {
      expect(
        await page.getByRole("button", { name: tip }).count(),
      ).toBeGreaterThan(0);
    }
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
    await page
      .getByRole("menuitem", { name: /leave out of the ranking/i })
      .click();

    await expect.poll(async () => (await rowNames(page)).length).toBe(9);
    const footnote = page.getByText(/actions outside the ranking/);
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
    await expect(
      drawer.getByRole("link", { name: "Methodology and data sources" }),
    ).toBeVisible();

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
    await page.getByText(/actions? outside the ranking/).click();
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

      // Every action is a card; there is no table to scroll sideways.
      await expect(page.getByRole("table")).toHaveCount(0);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      // The cookie banner is reachable with a real click (the notice sits under it).
      await page.goto(home());
      await expect(page.getByText("All actions, in order")).toBeVisible();
      const decline = page.getByRole("button", {
        name: "Decline",
        exact: true,
      });
      if (await decline.isVisible().catch(() => false)) {
        await decline.click({ timeout: 5_000 });
      }

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

const sub = (segment: string, city = "sobral") =>
  `${DEMO}/${city}/adaptation/${segment}/`;

async function openSub(page: Page, segment: string, heading: string) {
  await page.goto(sub(segment));
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({
    timeout: 90_000,
  });
  await dismissOverlays(page);
}

/** Ticks one option of a facet dropdown, then closes the menu. */
async function pickFacet(page: Page, facet: RegExp, option: RegExp) {
  await page.getByRole("button", { name: facet }).click();
  await page.getByRole("menuitemcheckbox", { name: option }).click();
  await page.keyboard.press("Escape");
}

const rows = (page: Page) => page.getByTestId("expandable-row");

async function csvLines(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /export csv/i }).click();
  const file = await download;
  return (await (await file.createReadStream()).toArray())
    .join("")
    .trim()
    .split("\n").length;
}

test.describe("Proposal sub-pages (BR-N2, N7–N10)", () => {
  test("BR-N2 lists hazards highest first, filters, expands and exports", async ({
    page,
  }) => {
    await openSub(page, "risk", "Hazards");
    await expect(rows(page)).toHaveCount(12);
    const index = await page
      .getByText(/^Index \d\.\d\d$/)
      .allInnerTexts()
      .then((xs) => xs.map((x) => Number(x.replace("Index ", ""))));
    expect(index).toEqual([...index].sort((a, b) => b - a));

    await pickFacet(page, /^Risk level/, /^High/);
    await expect(page).toHaveURL(/level=high/);
    const high = await rows(page).count();
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThan(12);
    for (const text of await rows(page).allInnerTexts())
      expect(text).toContain("High risk");
    expect(await csvLines(page)).toBe(high + 1);

    await rows(page).first().getByRole("button").first().click();
    await expect(page.getByText("What drives it").first()).toBeVisible();
    await expect(
      page.getByText("Actions that reduce it").first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Scenario/ }).click();
    await page.getByRole("menuitemradio", { name: /2050/ }).click();
    await expect(
      page.getByText(/ranking is computed on present-day values/),
    ).toBeVisible();
  });

  test("BR-N7 legal filters by facet and a row opens on its norms", async ({
    page,
  }) => {
    await openSub(page, "legal", "Actions and the norms behind them");
    await expect(rows(page)).toHaveCount(14);
    await pickFacet(page, /^Sector/, /^Health/);
    await expect(page).toHaveURL(/sector=health/);
    expect(await rows(page).count()).toBeLessThan(14);
    await page
      .getByRole("button", { name: /Provide public shading in heat hotspots/ })
      .click();
    await expect(
      page.getByRole("columnheader", { name: "Norm" }),
    ).toBeVisible();
  });

  test("BR-N8 finance leads with CAPAG, then options, then each action", async ({
    page,
  }) => {
    await openSub(page, "finance", "Funding gap per action");
    // CAPAG first, explained, with the Treasury's pages.
    await expect(page.getByText("CAPAG C", { exact: true })).toBeVisible();
    await expect(page.getByText(/decides access to credit/)).toBeVisible();
    await expect(
      page.locator('a[href*="tesourotransparente.gov.br"]'),
    ).toHaveCount(2);
    // The routes in general, not tied to an action.
    await expect(
      page.getByTestId("financing-options").getByRole("heading"),
    ).toHaveCount(6);
    await expect(
      page.getByText("Non-reimbursable funds from the federal budget (OGU)."),
    ).toBeVisible();
    await expect(
      page.getByText(/Self-deliverable or credit · \d+ actions?/),
    ).toBeVisible();
    await expect(page.getByText(/^T[1-4]$/)).toHaveCount(0);
    const all = await rows(page).count();
    await pickFacet(page, /^Funding/, /^Self-deliverable or credit/);
    const self = await rows(page).count();
    expect(self).toBeGreaterThan(0);
    expect(self).toBeLessThan(all);
    expect(await csvLines(page)).toBe(self + 1);
    await rows(page).first().getByRole("button").first().click();
    await expect(
      page.getByText("Pathways to investigate").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "See all financing options" }).first(),
    ).toBeVisible();
  });

  test("BR-N9 policy keeps the score behind the calculation", async ({
    page,
  }) => {
    await openSub(page, "policy", "Policy support per action");
    await rows(page).first().getByRole("button").first().click();
    await expect(
      page.getByText("Evidence in the federal corpus").first(),
    ).toBeVisible();
    await expect(page.getByText(/^Alignment score/)).toHaveCount(0);
    await page.getByRole("button", { name: "Show the calculation" }).click();
    await expect(page.getByText(/^Alignment score/)).toBeVisible();
  });

  test("BR-N10 context shows the boundary and the indicators", async ({
    page,
  }) => {
    await openSub(page, "context", "City context");
    await expect(page.getByText("Population", { exact: true })).toBeVisible();
    await expect(page.getByText("CAPAG", { exact: true })).toBeVisible();
  });

  test("every proposal screen uses levels, never pills", async ({ page }) => {
    for (const [segment, heading] of [
      ["risk", "Hazards"],
      ["legal", "Actions and the norms behind them"],
      ["finance", "Funding gap per action"],
      ["policy", "Policy support per action"],
    ]) {
      await openSub(page, segment, heading);
      // The one tag left is the screen ID of the review chrome.
      await expect(page.locator(".chakra-tag__root")).toHaveCount(1);
      expect(await page.getByTestId("level").count()).toBeGreaterThan(3);
    }
  });

  test("links from the new screens never lead to the previous version", async ({
    page,
  }) => {
    await openHome(page);
    await page
      .getByRole("button", { name: /^View details for/ })
      .first()
      .click();
    await expect(page.getByText("Would you like to go further?")).toBeVisible();
    const hrefs = await page
      .locator('a[href*="/adaptation/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.filter((h) => h.includes("/previous"))).toEqual([]);
    expect(hrefs.some((h) => h.includes("/adaptation/finance"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/adaptation/policy"))).toBe(true);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "See the full risk profile" }).click();
    await expect(page).toHaveURL(/\/adaptation\/risk\/?$/);
    await page.getByRole("link", { name: "Back to module home" }).click();
    await expect(page).toHaveURL(/\/adaptation\/?$/);
  });

  for (const width of [640, 900]) {
    test(`sub-pages fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [segment, heading] of [
        ["risk", "Hazards"],
        ["finance", "Funding gap per action"],
        ["policy", "Policy support per action"],
        ["context", "City context"],
      ]) {
        await openSub(page, segment, heading);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${segment} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe("Previous version, kept for comparison", () => {
  test("BR-A1 uses plain wording and no AI styling", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/previous/`);
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
    await page.goto(`${DEMO}/sobral/adaptation/previous/risk/`);
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

  test("BR-A1 shows one table, without the duplicate chart", async ({
    page,
  }) => {
    await page.goto(`${DEMO}/sobral/adaptation/previous/preflight/`);
    await expect(
      page.getByRole("button", { name: /generate recommendations/i }),
    ).toBeVisible({ timeout: 90_000 });
    await dismissOverlays(page);
    await page
      .getByRole("button", { name: /generate recommendations/i })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ranked actions" }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Ranking at a glance")).toHaveCount(0);
  });

  test("BR-A2 exports the risk profile, honouring the sector filter", async ({
    page,
  }) => {
    await page.goto(`${DEMO}/sobral/adaptation/previous/risk/`);
    await expect(
      page.getByRole("heading", { name: "Twelve hazards" }),
    ).toBeVisible({
      timeout: 90_000,
    });
    await dismissOverlays(page);
    const lines = async () => {
      const dl = page.waitForEvent("download");
      await page.getByRole("button", { name: /export csv/i }).click();
      const file = await dl;
      return (await (await file.createReadStream()).toArray())
        .join("")
        .trim()
        .split("\n").length;
    };
    expect(await lines()).toBe(13);
    await page.getByText("Health", { exact: true }).first().click();
    expect(await lines()).toBe(5);
  });

  test("BR-A8 shows the funding-gap split as one bar", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/previous/finance/`);
    await expect(page.getByText("Funding gap per action")).toBeVisible({
      timeout: 90_000,
    });
    await expect(
      page.getByText(/Self-deliverable or credit/).first(),
    ).toBeVisible();
    await expect(page.getByText(/What the labels mean/)).toHaveCount(0);
  });

  test("BR-A3 has select all and clear on every list", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/previous/preferences/`);
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

test.describe("Routes, action cards, Plano Clima and Portuguese", () => {
  test("the previous version keeps its own flow", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/previous/`);
    await expect(
      page.getByRole("button", { name: /set your preferences/i }),
    ).toBeVisible({ timeout: 90_000 });
    // The corner notice starts as a pill; opened, it says what this section is.
    await dismissOverlays(page);
    // The dev-only Next.js badge sits over the pill, so dispatch the click.
    await page
      .getByRole("button", { name: /open decision/ })
      .dispatchEvent("click");
    await expect(
      page.getByText(/Previous version, kept for comparison/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Dismiss", exact: true })
      .dispatchEvent("click");
    await page.getByRole("button", { name: /set your preferences/i }).click();
    await expect(page).toHaveURL(/\/adaptation\/previous\/preferences\/?$/);
    const forward = page.locator('a[href*="/adaptation/previous/preflight"]');
    expect(await forward.count()).toBeGreaterThan(0);
  });

  test("old proposal and wizard links redirect", async ({ page }) => {
    await page.goto(`${DEMO}/sobral/adaptation/next/risk/`);
    await expect(page).toHaveURL(/\/adaptation\/risk\/?$/, { timeout: 90_000 });
    await page.goto(`${DEMO}/sobral/adaptation/preferences/`);
    // Old wizard links open the home with the preferences panel.
    await expect(page).toHaveURL(/\/adaptation\/\?panel=open$/);
  });

  test("the review guide leads to the new screens and lists the previous ones", async ({
    page,
  }) => {
    await page.goto(`${DEMO}/`);
    await expect(
      page.getByText("Previous version, for comparison"),
    ).toBeVisible({ timeout: 90_000 });
    const hrefs = await page
      .locator('a[href*="/adaptation"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.some((h) => /\/adaptation\/previous\/risk\/?$/.test(h))).toBe(
      true,
    );
    expect(hrefs.some((h) => /\/sobral\/adaptation\/risk\/?$/.test(h))).toBe(
      true,
    );
  });

  test("every action is its own card, named in the title style", async ({
    page,
  }) => {
    await openHome(page);
    const cards = page.getByTestId("ranked-action");
    const [a, b] = [
      await cards.nth(0).boundingBox(),
      await cards.nth(1).boundingBox(),
    ];
    expect(b!.y - (a!.y + a!.height)).toBeGreaterThanOrEqual(8);
    const sizes = await cards.nth(0).evaluate((card) => {
      const name = card.querySelector(
        'button[aria-label^="View details for"] > *',
      );
      const body = card.querySelector(
        '[data-testid="level"] p, [data-testid="level"] span',
      );
      return [
        parseFloat(getComputedStyle(name!).fontSize),
        parseFloat(getComputedStyle(body!).fontSize),
      ];
    });
    expect(sizes[0]).toBeGreaterThanOrEqual(16);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
  });

  test("the drawer separates related actions and shows co-benefits once", async ({
    page,
  }) => {
    await openHome(page);
    await page
      .getByRole("button", {
        name: /View details for Protect and enhance water sources/,
      })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByText("Co-benefits and adverse effects"),
    ).toHaveCount(1);
    expect(await drawer.getByTestId("related-action").count()).toBeGreaterThan(
      0,
    );
    await expect(
      drawer.getByText("Plano Clima", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer
        .getByTestId("plano-clima-plan")
        .filter({ hasText: "Recursos Hídricos" }),
    ).toHaveCount(1);
  });

  test("policy filters by the Plano Clima plan that cites the action", async ({
    page,
  }) => {
    await openSub(page, "policy", "Policy support per action");
    await pickFacet(page, /^Plano Clima plan/, /^Recursos Hídricos/);
    await expect(page).toHaveURL(/plan=/);
    const n = await rows(page).count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(14);
  });

  test("Portuguese shows no English on the new screens", async ({ page }) => {
    await page.goto(`/pt/public/hiap/brazil-demo/sobral/adaptation/`);
    await expect(page.getByText("Todas as ações, em ordem")).toBeVisible({
      timeout: 90_000,
    });
    const home = await page.locator("body").innerText();
    for (const english of [
      "All actions, in order",
      "View details",
      "Risk reduced",
      "High risk",
    ])
      expect(home).not.toContain(english);
    await page.goto(`/pt/public/hiap/brazil-demo/sobral/adaptation/risk/`);
    await expect(page.getByText(/Índice \d,\d\d/).first()).toBeVisible({
      timeout: 90_000,
    });
  });
});

test.describe("Fixes from the UI review", () => {
  test("sorting by funding gap puts self-deliverable actions first", async ({
    page,
  }) => {
    await openHome(page);
    await page.getByRole("button", { name: /^Sort by/ }).click();
    await page.getByRole("menuitemradio", { name: /Funding gap/ }).click();
    await expect(page.getByTestId("ranked-action").first()).toContainText(
      "Self-deliverable",
    );
    await expect(page).toHaveURL(/sort=funding/);
    // The choice survives a reload, because it lives in the URL.
    await page.reload();
    await expect(page.getByText("All actions, in order")).toBeVisible({
      timeout: 90_000,
    });
    await expect(
      page.getByRole("button", { name: /^Sort by: Funding gap/ }),
    ).toBeVisible();
  });

  test("a deep link opens its row on legal and policy", async ({ page }) => {
    await openSub(page, "legal", "Actions and the norms behind them");
    const id = await rows(page)
      .first()
      .locator("button")
      .first()
      .getAttribute("id");
    for (const [segment, heading, marker] of [
      ["legal", "Actions and the norms behind them", "Norm"],
      ["policy", "Policy support per action", "Show the calculation"],
    ]) {
      await page.goto(`${sub(segment)}#${id}`);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({
        timeout: 90_000,
      });
      // Collapsed rows keep their content in the DOM: look at visible text.
      await expect(
        page.getByText(marker).filter({ visible: true }).first(),
      ).toBeVisible();
    }
  });

  test("?action=top opens the first action's drawer", async ({ page }) => {
    await page.goto(`${home()}?action=top`);
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByRole("dialog").getByText("At a glance"),
    ).toBeVisible();
  });

  test("an unknown city is a 404, not Sobral", async ({ page }) => {
    const res = await page.goto(`${DEMO}/recife/adaptation/`);
    expect(res?.status()).toBe(404);
  });

  test("the home has a city switcher", async ({ page }) => {
    await openHome(page);
    await expect(
      page.getByRole("button", { name: "Switch city" }),
    ).toBeVisible();
  });
});

test.describe("Decisions from the deck review (C1, C2)", () => {
  test("C1: shortcuts find priorities without a priority label", async ({
    page,
  }) => {
    await openHome(page);
    const shortcuts = page.getByTestId("priority-shortcuts");
    const highRisk = shortcuts.getByRole("button", {
      name: /Reduces a high risk/,
    });
    await highRisk.click();
    await expect(highRisk).toHaveAttribute("aria-pressed", "true");
    // A shortcut is a plain facet value: it lives in the URL.
    await expect(page).toHaveURL(/level=high/);
    for (const card of await page.getByTestId("ranked-action").all())
      await expect(card.getByTestId("action-risk")).toContainText("High");
    await expect(page.getByText(/high priority/i)).toHaveCount(0);
    await highRisk.click();
    await expect(page).not.toHaveURL(/level=high/);
  });

  test("C2: a prerequisite outside the ranking says why", async ({ page }) => {
    await openHome(page);
    await expect(
      page.getByText(/\(not ranked, planning action\)/).first(),
    ).toBeVisible();
    await page.goto(`${home()}?action=top`);
    await expect(page.getByTestId("related-unranked").first()).toContainText(
      "Not ranked · A planning action",
      { timeout: 90_000 },
    );
  });
});
