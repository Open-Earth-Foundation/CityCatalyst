import { globSync, readFileSync, statSync } from "node:fs";

import { test } from "@e2e-dev/web";
import { parse } from "csv-parse/sync";
import { expect } from "e2e";

import { ADMIN_SESSION, CityCatalystApi } from "./support/citycatalyst.ts";

// Agentic port of the UI half of e2e/csv-download.spec.ts. The Playwright
// version flaked on the download modal (toast and response waits, Firefox
// `<a download>` handling) until the byte checks moved to the API. Here the
// agent downloads through the real modal and the file the browser saved is
// checked deterministically.
const EXPECTED_CSV_HEADERS = [
  "Inventory Reference",
  "GPC Reference Number",
  "Subsector name",
  "Notation Key",
  "Total Emissions",
  "Total Emission Units",
  "Activity type",
  "Activity Value",
  "Activity Units",
  "Emission Factor - CO2",
  "Emission Factor - CH4",
  "Emission Factor - N2O",
  "Emission Factor - Unit",
  "CO2 Emissions",
  "CH4 Emissions",
  "N2O Emissions",
  "Data source ID",
  "Data source name",
];

/**
 * `waitForDownload` returns a path relative to the attempt's artifact directory,
 * which tests cannot read yet, and the response body of a download is handed to
 * the file, not to `waitForResponse`. Read the newest saved copy under any
 * results directory (`.e2e`, or one passed with `--output`, e.g. `.e2e-ci`).
 */
function readDownload(relativePath: string): string {
  const [newest] = globSync(`.e2e*/artifacts/**/${relativePath}`)
    .map((file) => ({ file, modified: statSync(file).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
  if (!newest) throw new Error(`Downloaded file ${relativePath} not found`);
  return readFileSync(newest.file, "utf-8");
}

test(
  "CSV Download: user downloads the inventory as CSV from the download modal",
  { session: ADMIN_SESSION },
  async ({ app, agent, screen, browser }) => {
    await app.open("/en/cities/");
    const api = await CityCatalystApi.fromBrowser(app.baseUrl!, browser);
    const { cityId, inventoryId } = await api.createChicagoInventory();

    await app.open(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await expect(screen.getByTestId("hero-city-name")).toHaveText("Chicago");

    const download = await browser.waitForDownload(
      async () => {
        await agent.act(
          "Open the inventory download options, select only the CSV format and confirm the download",
        );
      },
      { timeout: 90_000 },
    );
    await expect(screen.getByTestId("download-modal-title")).toBeHidden();

    expect(download.suggestedFilename).toMatch(/inventory-.*\.csv$/);
    const [headers] = parse(readDownload(download.path), {
      columns: false,
    }) as string[][];
    expect(headers).toEqual(EXPECTED_CSV_HEADERS);
  },
);
