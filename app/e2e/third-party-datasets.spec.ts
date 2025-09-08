import { expect, test } from "@playwright/test";
import { indexPageRegex, regexForPath } from "./utils";
import { createInventoryThroughOnboarding } from "./helpers";

const testIds = {
  addDataToInventoryNavButton: "add-data-to-inventory-card",
  addDataStepHeading: "add-data-step-title",
  stationaryEnergySectorCard: "stationary-energy-sector-card",
  transportationSectorCard: "transportation-sector-card",
  wasteSectorCard: "waste-sector-card",
  sectorCardButton: "sector-card-button",
  subsectorCard: "subsector-card",
  searchThirdPartyButton: "search-third-party-button",
  dataSourceCard: "data-source-card",
  dataSourceDrawer: "data-source-drawer",
  connectDataButton: "connect-data-button",
  disconnectDataButton: "disconnect-data-button",
  connectedDataIndicator: "connected-data-indicator",
  dataSourceTitle: "data-source-title",
  noDataSourcesMessage: "no-data-sources-message",
  loadingIndicator: "loading-indicator",
};

test.describe("Third Party Datasets", () => {
  test("should complete third-party datasets workflow", async ({ page }) => {
    test.setTimeout(120000);

    // Step 1: Create inventory through onboarding flow
    await createInventoryThroughOnboarding(page);

    // Verify Dashboard
    await page.waitForLoadState("networkidle");
    // Verify page title
    await expect(page).toHaveTitle(/CityCatalyst/i);

    // Step 2: Navigate to add data page
    const navButton = page.getByTestId(testIds.addDataToInventoryNavButton);
    await navButton.click();
    await page.waitForURL(regexForPath("/data/"));
    await expect(page).toHaveURL(regexForPath("/data/"));

    // Verify page header
    const pageHeader = page.getByTestId(testIds.addDataStepHeading);
    await expect(pageHeader).toContainText("Add Data");

    // Verify sector cards are visible
    await expect(
      page.getByTestId(testIds.stationaryEnergySectorCard),
    ).toBeVisible();
    await expect(
      page.getByTestId(testIds.transportationSectorCard),
    ).toBeVisible();
    await expect(page.getByTestId(testIds.wasteSectorCard)).toBeVisible();

    // Step 3: Navigate to sector page and see third-party data section
    const stationaryEnergyCard = page.getByTestId(
      testIds.stationaryEnergySectorCard,
    );
    const sectorButton = stationaryEnergyCard.getByTestId(
      testIds.sectorCardButton,
    );
    await sectorButton.click();

    // Wait for navigation to sector page
    await page.waitForURL(regexForPath("/data/1/"));
    await expect(page).toHaveURL(regexForPath("/data/1/"));

    // Wait for subsectors to load
    await page.waitForSelector(`[data-testid="${testIds.subsectorCard}"]`);
    const subsectorCards = page.getByTestId(testIds.subsectorCard);
    expect(await subsectorCards.count()).toBeGreaterThan(0);

    // Step 4: Search for third-party data sources
    // Look for "Search for third-party data" button
    const searchButton = page
      .getByRole("button")
      .filter({
        hasText: /search.*third|third.*party|external.*data/i,
      })
      .first();

    if (await searchButton.isVisible()) {
      await searchButton.click();

      // Wait for data sources to load or "no data sources" message
      await Promise.race([
        page.waitForSelector('[data-testid*="source-card"]', {
          timeout: 10000,
        }),
        page.waitForSelector('[data-testid="no-data-sources-message"]', {
          timeout: 10000,
        }),
      ]);

      // Check if we have data source cards or a no data message
      const dataSourceCards = page.locator('[data-testid*="source-card"]');
      const noDataMessage = page.locator(
        '[data-testid="no-data-sources-message"]',
      );

      const hasDataSources = (await dataSourceCards.count()) > 0;
      const hasNoDataMessage = await noDataMessage.isVisible();

      // Either we should have data sources or a no data message
      expect(hasDataSources || hasNoDataMessage).toBeTruthy();

      // Step 5: If data sources exist, test interaction and connection
      if (hasDataSources) {
        // Click on first data source to open drawer
        await dataSourceCards.first().click();
        await page.waitForTimeout(1000);

        // Check if drawer opened (should have a back button)
        const backButton = page
          .getByRole("button")
          .filter({ hasText: /back/i });
        await expect(backButton).toBeVisible();

        // Check for connect data button in drawer
        const connectButton = page.getByRole("button").filter({
          hasText: /connect.*data/i,
        });
        await expect(connectButton).toBeVisible();

        // Test connection functionality
        const firstDataSource = dataSourceCards.first();
        const connectButtonInCard = firstDataSource.getByRole("button").filter({
          hasText: /connect.*data/i,
        });

        if (await connectButtonInCard.isVisible()) {
          // Click connect button in drawer
          const connectButtonInDrawer = page
            .getByRole("button")
            .filter({ hasText: /connect.*data/i })
            .last();
          await connectButtonInDrawer.click();

          // Wait for connection to complete
          await page.waitForTimeout(3000);

          // Go back to see the updated state
          if (await backButton.isVisible()) {
            await backButton.click();
            await page.waitForTimeout(1000);
          }

          // Verify the source now shows as connected
          const connectedIndicator =
            firstDataSource.getByText(/connected|disconnect/i);
          const checkIcon = firstDataSource.locator(
            'svg[data-testid*="check"]',
          );

          const isConnected =
            (await connectedIndicator.isVisible().catch(() => false)) ||
            (await checkIcon.isVisible().catch(() => false));

          if (isConnected) {
            // Test disconnecting the data source
            await firstDataSource.hover();
            await page.waitForTimeout(500);

            // Look for disconnect button
            const disconnectButton = firstDataSource
              .getByRole("button")
              .filter({
                hasText: /disconnect/i,
              });

            if (await disconnectButton.isVisible()) {
              await disconnectButton.click();
              await page.waitForTimeout(2000);

              // Verify source is disconnected
              const connectButtonAfterDisconnect = firstDataSource
                .getByRole("button")
                .filter({ hasText: /connect.*data/i });
              await expect(connectButtonAfterDisconnect).toBeVisible();
            }
          }
        } else {
          // Close the drawer if we can't test connection
          await backButton.click();
          await page.waitForTimeout(500);
        }
      } else if (hasNoDataMessage) {
        // Step 6: Test graceful handling of no data sources
        await expect(noDataMessage).toBeVisible();

        // Navigate to another sector that might not have data sources (Waste)
        await page.goto("./data/");
        await page.waitForURL(regexForPath("/data/"));

        const wasteCard = page.getByTestId(testIds.wasteSectorCard);
        const wasteSectorButton = wasteCard.getByTestId(
          testIds.sectorCardButton,
        );
        await wasteSectorButton.click();
        await page.waitForURL(regexForPath("/data/3/"));

        // Click on a subsector if available
        const subsectorCards = page.getByTestId(testIds.subsectorCard);
        if ((await subsectorCards.count()) > 0) {
          await subsectorCards.first().click();
          await page.waitForTimeout(2000);

          // Look for search button in waste sector
          const wasteSearchButton = page
            .getByRole("button")
            .filter({
              hasText: /search.*third|third.*party|external.*data/i,
            })
            .first();

          if (await wasteSearchButton.isVisible()) {
            await wasteSearchButton.click();
            await page.waitForTimeout(2000);

            // Check for no data sources message or available data sources
            const wasteNoDataMessage = page.getByText(
              /no.*data.*available|no.*third.*party|missing.*third.*party/i,
            );
            const wasteDataSourceCards = page.locator(
              '[data-testid*="source-card"]',
            );

            // Either we have data sources or a message saying there are none
            const hasContent =
              (await wasteNoDataMessage.isVisible()) ||
              (await wasteDataSourceCards.count()) > 0;
            expect(hasContent).toBeTruthy();
          }
        }
      }
    }
  });
});
