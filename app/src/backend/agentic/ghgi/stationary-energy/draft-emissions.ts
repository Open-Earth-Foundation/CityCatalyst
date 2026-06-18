import CalculationService, { type Gas } from "@/backend/CalculationService";
import { Decimal } from "decimal.js";

type JsonObject = Record<string, unknown>;

export async function enrichStationaryEnergyDraftCO2e(
  payload: unknown,
): Promise<unknown> {
  if (!isObject(payload)) {
    return payload;
  }

  const rows: JsonObject[] = [];
  for (const proposal of arrayOfObjects(payload.proposals)) {
    const proposedValue = asObject(proposal.proposed_value);
    if (!proposedValue) {
      continue;
    }
    rows.push(asObject(proposedValue.row) ?? proposedValue);
  }

  for (const candidate of arrayOfObjects(payload.source_candidates)) {
    rows.push(...arrayOfObjects(candidate.normalized_rows));
  }

  const rowGasGroups = rows
    .filter((row) => !hasDirectEmissions(row))
    .map((row) => ({ row, gases: extractGasAmounts(row) }))
    .filter(({ gases }) => gases.length > 0);
  if (rowGasGroups.length === 0) {
    return payload;
  }

  const results = await CalculationService.calculateCO2eqForGasGroups(
    rowGasGroups.map(({ gases }) => gases),
  );
  results.forEach(({ totalCO2e, totalCO2eYears }, index) => {
    const row = rowGasGroups[index].row;
    row.emissions_value_100yr = totalCO2e.toFixed();
    row.emissions_unit = "kgco2e";
    row.co2eq_years = totalCO2eYears;
  });

  return payload;
}

function extractGasAmounts(row: JsonObject): Gas[] {
  return arrayOfObjects(row.gases)
    .map((gas): Gas | null => {
      const name = stringValue(gas.gas, gas.gas_name, gas.name)?.toUpperCase();
      const amount = decimalValue(
        gas.emissions_value,
        gas.gas_amount,
        gas.amount,
      );
      if (!name || !amount) {
        return null;
      }
      return { gas: name, amount };
    })
    .filter((gas): gas is Gas => gas != null);
}

function hasDirectEmissions(row: JsonObject): boolean {
  return (
    decimalValue(
      row.emissions_value_100yr,
      row.co2eq_100yr,
      row.co2eq,
      row.emissions_value,
    ) != null
  );
}

function decimalValue(...values: unknown[]): Decimal | null {
  for (const value of values) {
    if (value == null || value === "") {
      continue;
    }
    try {
      const decimal = new Decimal(String(value));
      if (decimal.isFinite()) {
        return decimal;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function arrayOfObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function asObject(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
