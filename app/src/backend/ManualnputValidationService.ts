// ideally this validation service would run before the ActivityService.createActivity or the ActivityService.updateActivity function is called

import { ActivityValue, ActivityValueAttributes } from "@/models/ActivityValue";
import { InventoryValueAttributes } from "@/models/InventoryValue";
import { Methodology } from "@/models/Methodology";
import {
  DirectMeasure,
  findMethodology,
  MANUAL_INPUT_HIERARCHY,
} from "@/util/form-schema";
import createHttpError from "http-errors";
import { db } from "@/models";

// validation rules

export default class ManualInputValidationService {
  public static async validateActivity({
    inventoryValueId,
    inventoryValueParams,
    activityValueParams,
  }: {
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    inventoryValueParams?: Omit<InventoryValueAttributes, "id">;
    inventoryValueId?: string;
  }) {
    let inventoryValue;

    if (!inventoryValueParams && !inventoryValueId) {
      throw new createHttpError.BadRequest(
        "Either inventoryValueId or inventoryValue must be provided",
      );
    }

    if (inventoryValueParams) {
      inventoryValue = inventoryValueParams;
    } else {
      // fetch the inventory value from the database
      inventoryValue =
        await db.models.InventoryValue.findByPk(inventoryValueId);
    }

    // check if the activity has all required fields
    const referenceNumber = inventoryValue?.gpcReferenceNumber as string;
    const methodologyId = inventoryValue?.inputMethodology as string;

    let methodology: Methodology | DirectMeasure | undefined;

    if (methodologyId === "direct-measure") {
      methodology = MANUAL_INPUT_HIERARCHY[referenceNumber]
        ?.directMeasure as DirectMeasure;
    }

    methodology = findMethodology(methodologyId, referenceNumber);
    // check if the methodology exists
    if (!methodology) {
      throw new Error(`Methodology ${methodologyId} not found`);
    }

    // some how extract, the extra fields and validate they are all present except for the ones that are optional

    // the exclusive fields validation (making sure that no)
  }

  private static async validateExtraFields({
    extraFields,
    methodology,
  }: {
    extraFields: Record<string, string>;
    methodology: Methodology;
  }) {
    // check if the extra fields are valid
  }

  private static async uniqueByValidation({
    referenceNumber,
    uniqueBy,
  }: {
    referenceNumber: string;
    uniqueBy: string[];
  }) {
    // check if the uniqueBy fields are unique
  }
}
