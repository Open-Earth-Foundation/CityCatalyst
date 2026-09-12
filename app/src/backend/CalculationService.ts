import { logger } from "@/services/logger";
import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { GasToCO2Eq } from "@/models/GasToCO2Eq";
import type { InventoryValue } from "@/models/InventoryValue";
import createHttpError from "http-errors";
import { findMethodology } from "@/util/form-schema";
import {
  handleActivityAmountTimesEmissionsFactorFormula,
  handleBiologicalTreatmentFormula,
  handleDirectMeasureFormula,
  handleDomesticWasteWaterFormula,
  handleIncinerationWasteFormula,
  handleIndustrialWasteWaterFormula,
  handleMethaneCommitmentFormula,
  handleVkt1Formula,
} from "./formulas";
import { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import { GasValueCreationAttributes } from "@/models/GasValue";
import { Decimal } from "decimal.js";
import { GlobalWarmingPotentialTypeEnum } from "@/util/enums";
import { decimalToBigInt } from "@/util/big_int";

export type Gas = {
  gas: string;
  amount: Decimal;
};

export type GasAmountResult = {
  totalCO2e: Decimal;
  totalCO2eYears: number;
  gases: Gas[];
};

export type GasValue = Omit<GasValueCreationAttributes, "id"> & {
  emissionsFactor?:
    | EmissionsFactorAttributes
    | Omit<EmissionsFactorAttributes, "id">;
};

const DEFAULT_CO2EQ_YEARS = 100;

/** Default when inventory.globalWarmingPotentialType is missing. */
export const DEFAULT_GWP_VERSION = GlobalWarmingPotentialTypeEnum.ar5;

export default class CalculationService {
  /**
   * Normalize inventory GWP selection. Unknown / null → AR5.
   */
  public static resolveGwpVersion(
    value?: string | GlobalWarmingPotentialTypeEnum | null,
  ): GlobalWarmingPotentialTypeEnum {
    if (value === GlobalWarmingPotentialTypeEnum.ar6 || value === "ar6") {
      return GlobalWarmingPotentialTypeEnum.ar6;
    }
    if (value === GlobalWarmingPotentialTypeEnum.ar5 || value === "ar5") {
      return GlobalWarmingPotentialTypeEnum.ar5;
    }
    if (value) {
      logger.warn(
        { gwp: value },
        "Unknown globalWarmingPotentialType; defaulting to ar5",
      );
    }
    return DEFAULT_GWP_VERSION;
  }

  public static async loadGasToCO2Eqs(
    gwpVersion: GlobalWarmingPotentialTypeEnum,
  ): Promise<GasToCO2Eq[]> {
    return db.models.GasToCO2Eq.findAll({
      where: { gwpVersion },
    });
  }

  private static calculateCO2eq(
    gasToCO2Eqs: GasToCO2Eq[],
    gasName: string,
    amount: Decimal,
  ): { co2eq: Decimal; co2eqYears: number } {
    const globalWarmingPotential = gasToCO2Eqs.find(
      (entry) => entry.gas === gasName,
    );

    if (!globalWarmingPotential) {
      throw new createHttpError.NotFound(
        `Could not find gas ${gasName} in GasToCO2Eq table`,
      );
    }

    const co2eq = Decimal.mul(amount, globalWarmingPotential.co2eqPerKg || 0);
    const co2eqYears = globalWarmingPotential.co2eqYears || DEFAULT_CO2EQ_YEARS;
    return { co2eq, co2eqYears };
  }

  private static sumGasCO2eq(
    gasToCO2Eqs: GasToCO2Eq[],
    gases: Gas[],
  ): { totalCO2e: Decimal; totalCO2eYears: number } {
    let totalCO2e = new Decimal(0);
    let totalCO2eYears = 0;

    for (const gas of gases) {
      const { co2eq, co2eqYears } = this.calculateCO2eq(
        gasToCO2Eqs,
        gas.gas,
        gas.amount,
      );

      totalCO2e = Decimal.sum(totalCO2e, co2eq);
      totalCO2eYears = Math.max(co2eqYears, totalCO2eYears);
    }

    return { totalCO2e, totalCO2eYears };
  }

  public static async calculateCO2eqForGases(
    gases: Gas[],
    gwpVersion?: string | GlobalWarmingPotentialTypeEnum | null,
  ): Promise<{ totalCO2e: Decimal; totalCO2eYears: number }> {
    const [result] = await this.calculateCO2eqForGasGroups(
      [gases],
      gwpVersion,
    );
    return result;
  }

  public static async calculateCO2eqForGasGroups(
    gasGroups: Gas[][],
    gwpVersion?: string | GlobalWarmingPotentialTypeEnum | null,
  ): Promise<Array<{ totalCO2e: Decimal; totalCO2eYears: number }>> {
    const version = this.resolveGwpVersion(gwpVersion);
    const gasToCO2Eqs = await this.loadGasToCO2Eqs(version);
    return gasGroups.map((gases) => this.sumGasCO2eq(gasToCO2Eqs, gases));
  }

  public static async getFormula(inputMethodology: string): Promise<string> {
    if (inputMethodology === "direct-measure") {
      return "direct-measure";
    }

    const formula = "activity-amount-times-emissions-factor"; // fallback value

    const methodology = findMethodology(inputMethodology);
    if (!methodology) {
      throw new createHttpError.NotFound(
        `Could not find methodology ${inputMethodology} in manual-input-hierarchy.json`,
      );
    }
    return methodology.formula ?? formula;
  }

  public static getFormulaMapping(
    inputMethodology: string,
  ): Record<string, string> {
    const methodology = findMethodology(inputMethodology);
    if (!methodology) {
      throw new createHttpError.NotFound(
        `Could not find methodology ${inputMethodology} in manual-input-hierarchy.json`,
      );
    }

    return methodology.activities?.[0]?.["formula-mapping"] as Record<
      string,
      string
    >;
  }

  public static async calculateGasAmount(
    inventoryValue: InventoryValue,
    activityValue: ActivityValue,
    inputMethodology: string,
    gasValues: GasValue[],
  ): Promise<GasAmountResult> {
    const formula = await CalculationService.getFormula(inputMethodology);

    const inventory = await db.models.Inventory.findByPk(
      inventoryValue.inventoryId,
    );
    const gwpVersion = this.resolveGwpVersion(
      inventory?.globalWarmingPotentialType,
    );
    const gasToCO2Eqs = await this.loadGasToCO2Eqs(gwpVersion);
    let gases: Gas[] = [];

    switch (formula) {
      case "direct-measure":
        gases = handleDirectMeasureFormula(activityValue);
        break;
      case "activity-amount-times-emissions-factor":
        gases = handleActivityAmountTimesEmissionsFactorFormula(
          activityValue,
          gasValues,
          inventoryValue,
        );
        break;
      case "methane-commitment":
        try {
          gases = await handleMethaneCommitmentFormula(
            activityValue,
            inventoryValue,
            inputMethodology,
          );
        } catch (error) {
          logger.error(error);
          throw new createHttpError.InternalServerError(
            `Error calculating methane commitment`,
          );
        }
        break;
      case "incineration-waste":
        const incinerationFormulaMapping =
          CalculationService.getFormulaMapping(inputMethodology);
        gases = await handleIncinerationWasteFormula(
          activityValue,
          inventoryValue,
          incinerationFormulaMapping,
        );
        break;
      case "induced-activity-1":
        gases = handleVkt1Formula(activityValue, gasValues, inventoryValue);
        break;
      case "biological-treatment":
        const formulaMapping =
          CalculationService.getFormulaMapping(inputMethodology);
        gases = await handleBiologicalTreatmentFormula(
          activityValue,
          inventoryValue,
          formulaMapping,
        );
        break;
      case "wastewater-calculator":
        const activityId = activityValue.metadata?.activityId;

        if (
          activityId === "wastewater-inside-domestic-calculator-activity" ||
          activityId === "wastewater-outside-domestic-calculator-activity"
        ) {
          const prefixKey = activityId.split("-").slice(0, -1).join("-");
          if (!inventory) {
            throw new createHttpError.NotFound("Inventory not found");
          }
          gases = await handleDomesticWasteWaterFormula(
            activityValue,
            inventory,
            inventoryValue,
            prefixKey,
          );
        } else if (
          activityId === "wastewater-inside-industrial-calculator-activity" ||
          activityId === "wastewater-outside-industrial-calculator-activity"
        ) {
          const prefixKey = activityId.split("-").slice(0, -1).join("-");
          gases = await handleIndustrialWasteWaterFormula(
            activityValue,
            inventoryValue,
            prefixKey,
          );
        } else {
          throw new createHttpError.BadRequest(
            `Unknown activity ID ${activityId} for wastewater calculator formula in activity value ${activityValue.id}`,
          );
        }
        break;
      default:
        throw new createHttpError.NotImplemented(
          `Formula ${formula} not yet implemented for input methodology ${inventoryValue.inputMethodology}`,
        );
    }

    const { totalCO2e, totalCO2eYears } = this.sumGasCO2eq(gasToCO2Eqs, gases);

    return {
      totalCO2e,
      totalCO2eYears,
      gases,
    };
  }

  /**
   * Recompute ActivityValue / InventoryValue co2eq from stored GasValue.gasAmount
   * using the inventory's GWP version (AR5/AR6).
   */
  public static async recalculateInventoryCO2eq(
    inventoryId: string,
  ): Promise<{ activityValuesUpdated: number; inventoryValuesUpdated: number }> {
    const inventory = await db.models.Inventory.findByPk(inventoryId);
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    const gwpVersion = this.resolveGwpVersion(
      inventory.globalWarmingPotentialType,
    );
    const gasToCO2Eqs = await this.loadGasToCO2Eqs(gwpVersion);
    const gwpByGas = new Map(
      gasToCO2Eqs.map((entry) => [entry.gas, entry] as const),
    );

    const inventoryValues = await db.models.InventoryValue.findAll({
      where: { inventoryId },
      include: [
        {
          model: db.models.ActivityValue,
          as: "activityValues",
          include: [
            {
              model: db.models.GasValue,
              as: "gasValues",
            },
          ],
        },
        {
          model: db.models.GasValue,
          as: "gasValues",
        },
      ],
    });

    let activityValuesUpdated = 0;
    let inventoryValuesUpdated = 0;

    for (const inventoryValue of inventoryValues) {
      let inventoryValueCO2e = new Decimal(0);
      let inventoryValueCO2eYears = 0;
      let touchedActivity = false;

      const activityValues = inventoryValue.activityValues ?? [];
      for (const activityValue of activityValues) {
        const gases = (activityValue.gasValues ?? [])
          .filter((gv) => gv.gas && gv.gasAmount != null)
          .map((gv) => ({
            gas: gv.gas!,
            amount: new Decimal(gv.gasAmount!.toString()),
          }));

        if (gases.length === 0) {
          // Keep existing activity co2eq (e.g. third-party / pre-aggregated).
          if (activityValue.co2eq != null) {
            inventoryValueCO2e = Decimal.sum(
              inventoryValueCO2e,
              new Decimal(activityValue.co2eq.toString()),
            );
            inventoryValueCO2eYears = Math.max(
              inventoryValueCO2eYears,
              activityValue.co2eqYears ?? 0,
            );
          }
          continue;
        }

        const knownGases = gases.filter((gas) => gwpByGas.has(gas.gas));
        if (knownGases.length === 0) {
          if (activityValue.co2eq != null) {
            inventoryValueCO2e = Decimal.sum(
              inventoryValueCO2e,
              new Decimal(activityValue.co2eq.toString()),
            );
            inventoryValueCO2eYears = Math.max(
              inventoryValueCO2eYears,
              activityValue.co2eqYears ?? 0,
            );
          }
          continue;
        }

        const { totalCO2e, totalCO2eYears } = this.sumGasCO2eq(
          gasToCO2Eqs,
          knownGases,
        );
        activityValue.co2eq = decimalToBigInt(totalCO2e);
        activityValue.co2eqYears = totalCO2eYears;
        await activityValue.save();
        activityValuesUpdated += 1;
        touchedActivity = true;

        inventoryValueCO2e = Decimal.sum(inventoryValueCO2e, totalCO2e);
        inventoryValueCO2eYears = Math.max(
          inventoryValueCO2eYears,
          totalCO2eYears,
        );
      }

      // Legacy inventory-value-level gas rows (no activity values).
      if (activityValues.length === 0) {
        const gases = (inventoryValue.gasValues ?? [])
          .filter((gv) => gv.gas && gv.gasAmount != null)
          .map((gv) => ({
            gas: gv.gas!,
            amount: new Decimal(gv.gasAmount!.toString()),
          }))
          .filter((gas) => gwpByGas.has(gas.gas));

        if (gases.length > 0) {
          const { totalCO2e, totalCO2eYears } = this.sumGasCO2eq(
            gasToCO2Eqs,
            gases,
          );
          inventoryValue.co2eq = decimalToBigInt(totalCO2e);
          inventoryValue.co2eqYears = totalCO2eYears;
          await inventoryValue.save();
          inventoryValuesUpdated += 1;
        }
        continue;
      }

      if (touchedActivity) {
        inventoryValue.co2eq = decimalToBigInt(inventoryValueCO2e);
        inventoryValue.co2eqYears = inventoryValueCO2eYears || undefined;
        await inventoryValue.save();
        inventoryValuesUpdated += 1;
      }
    }

    logger.info(
      {
        inventoryId,
        gwpVersion,
        activityValuesUpdated,
        inventoryValuesUpdated,
      },
      "Recalculated inventory CO2e with inventory GWP version",
    );

    return { activityValuesUpdated, inventoryValuesUpdated };
  }
}
