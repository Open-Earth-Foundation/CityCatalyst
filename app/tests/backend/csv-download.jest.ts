import { describe, expect, it, jest } from "@jest/globals";
import { parse } from "csv-parse/sync";
import CSVDownloadService from "@/backend/CSVDownloadService";
import CalculationService from "@/backend/CalculationService";
import type { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";

jest.spyOn(CalculationService, "loadGasToCO2Eqs").mockResolvedValue([]);

const row = (
  reference: string,
  amount: unknown,
  options: Record<string, unknown> = {},
) => ({
  id: reference,
  gpcReferenceNumber: reference,
  subSector: { subsectorName: "Example" },
  subCategoryId: undefined,
  activityValues: [
    {
      activityData: { "activity-value": amount },
      metadata: {},
      gasValues: [],
      ...((options.activity as object) ?? {}),
    },
  ],
  ...options,
});

async function records(inventoryValues: unknown[]) {
  const inventory = {
    inventoryValues,
  } as unknown as InventoryWithInventoryValuesAndActivityValues;
  const { headerTitles, inventoryLines } =
    await CSVDownloadService.extractCSVData(inventory, "en");
  const csv = CSVDownloadService.stringifyCSV(
    headerTitles,
    inventoryLines,
  ).toString();
  return parse(csv, { columns: true, skip_empty_lines: true }) as Record<
    string,
    string
  >[];
}

describe("CSV inventory export", () => {
  it("leaves absent or invalid activity values, factors and references blank without losing zero", async () => {
    const values = await records([
      row("I.1.1", undefined),
      row("I.2.1", "not a number"),
      row("I.3.1", "  "),
      row("IV.1", 0),
      row("V.1", "12.5", { subCategoryId: "real-reference" }),
    ]);
    const byRef = Object.fromEntries(
      values.map((value) => [value["GPC Reference Number"], value]),
    );
    expect(byRef["I.1.1"]["Activity Value"]).toBe("");
    expect(byRef["I.2.1"]["Activity Value"]).toBe("");
    expect(byRef["I.3.1"]["Activity Value"]).toBe("");
    expect(byRef["I.1.1"]["Emission Factor - Unit"]).toBe("");
    expect(byRef["IV.1"]["Activity Value"]).toBe("0");
    expect(byRef["IV.1"]["Inventory Reference"]).toBe("");
    expect(byRef["V.1"]["Inventory Reference"]).toBe("real-reference");
    expect(byRef["V.1"]["Activity Value"]).toBe("12.5");
  });

  it("exports the actual unit of a present factor and preserves notation keys", async () => {
    const values = await records([
      row("I.1.1", 3, {
        subCategoryId: "manual",
        activity: {
          gasValues: [
            {
              gas: "CO2",
              emissionsFactor: { emissionsPerActivity: 0, units: "kg/kWh" },
            },
          ],
        },
      }),
      row("V.2", null, { unavailableReason: "NO" }),
      row("II.1.1", 4, {
        activity: {
          gasValues: [
            {
              gas: "CO2",
              emissionsFactor: { emissionsPerActivity: 3, units: "kg/kWh" },
            },
            {
              gas: "CH4",
              emissionsFactor: { emissionsPerActivity: 1, units: "kg/m3" },
            },
          ],
        },
      }),
    ]);
    const byRef = Object.fromEntries(
      values.map((value) => [value["GPC Reference Number"], value]),
    );
    expect(byRef["I.1.1"]["Emission Factor - CO2"]).toBe("0");
    expect(byRef["I.1.1"]["Emission Factor - Unit"]).toBe("kg/kWh");
    expect(byRef["I.1.1"]["Inventory Reference"]).toBe("manual");
    expect(byRef["V.2"]["Notation Key"]).toBe("NO");
    expect(byRef["II.1.1"]["Emission Factor - Unit"]).toBe("");
  });

  it("uses a shared unit only when every exported factor has the same known unit", async () => {
    const factor = (gas: string, amount: number, units?: string | null) => ({
      gas,
      emissionsFactor: { emissionsPerActivity: amount, units },
    });
    const values = await records([
      row("I.1.1", 1, {
        activity: {
          gasValues: [factor("CO2", 1, "kg/kWh"), factor("CH4", 2, null)],
        },
      }),
      row("I.2.1", 1, {
        activity: {
          gasValues: [factor("CO2", 1, "kg/kWh"), factor("CH4", 2, "")],
        },
      }),
      row("I.3.1", 1, {
        activity: {
          gasValues: [factor("CO2", 1, "kg/kWh"), factor("CH4", 2, "kg/kWh")],
        },
      }),
      row("I.4.1", 1, {
        activity: {
          gasValues: [factor("CO2", 1, "kg/kWh"), factor("CO2", 2, "kg/m3")],
        },
      }),
      row("I.5.1", 1, {
        activity: {
          gasValues: [factor("CO2", 1, null), factor("CO2", 2, "kg/kWh")],
        },
      }),
    ]);
    const byRef = Object.fromEntries(
      values.map((value) => [value["GPC Reference Number"], value]),
    );
    for (const ref of ["I.1.1", "I.2.1", "I.5.1"]) {
      expect(byRef[ref]["Emission Factor - Unit"]).toBe("");
    }
    expect(byRef["I.3.1"]["Emission Factor - Unit"]).toBe("kg/kWh");
    expect(byRef["I.4.1"]["Emission Factor - CO2"]).toBe("1");
    expect(byRef["I.4.1"]["Emission Factor - Unit"]).toBe("kg/kWh");
    expect(byRef["I.5.1"]["Emission Factor - CO2"]).toBe("1");
  });
});
