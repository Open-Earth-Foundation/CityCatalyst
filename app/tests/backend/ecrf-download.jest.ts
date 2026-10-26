/**
 * @jest-environment node
 *
 * CC-1017: eCRF export must not 500 on eCRF-imported inventories
 * (empty activity gasValues, missing emissions factors).
 */
import { describe, expect, it } from "@jest/globals";
import ECRFDownloadService from "@/backend/ECRFDownloadService";
import type { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";

function baseInventory(
  activityValues: Record<string, unknown>[],
): InventoryWithInventoryValuesAndActivityValues {
  return {
    inventoryId: "inv-1",
    year: 2016,
    inventoryType: "gpc_basic",
    city: {
      cityId: "city-1",
      name: "Mexico City",
      locode: "MX MEX",
      country: "Mexico",
      region: "CDMX",
    },
    inventoryValues: [
      {
        id: "iv-1",
        gpcReferenceNumber: "I.1.1",
        co2eq: 1000000n,
        inputMethodology: "direct-measure",
        dataSource: null,
        unavailableReason: null,
        activityValues,
      },
    ],
  } as unknown as InventoryWithInventoryValuesAndActivityValues;
}

describe("ECRFDownloadService.downloadECRF (CC-1017)", () => {
  it("exports when activity has empty gasValues (eCRF import shape)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      baseInventory([
        {
          co2eq: 1000000n,
          activityData: {
            "activity-value": 10,
            "activity-value-unit": "units-tonnes",
            co2_amount: 900,
            ch4_amount: 1,
            n2o_amount: 0.5,
            "data-source": "eCRF import",
          },
          metadata: {
            activityTitle: "activity-value",
            dataQuality: "low",
          },
          gasValues: [],
        },
      ]),
      "en",
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("exports when GasValue has amount but no emissionsFactor", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      baseInventory([
        {
          co2eq: 500000n,
          activityData: { "activity-value": 1 },
          metadata: { activityTitle: "activity-value", dataQuality: "low" },
          gasValues: [
            { gas: "CO2", gasAmount: 400000n, emissionsFactor: null },
            { gas: "CH4", gasAmount: 1000n, emissionsFactor: null },
          ],
        },
      ]),
      "en",
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
