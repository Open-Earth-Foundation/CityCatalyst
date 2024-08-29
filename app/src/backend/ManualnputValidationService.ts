// ideally this validation service would run before the ActivityService.createActivity or the ActivityService.updateActivity function is called

import { ActivityValue, ActivityValueAttributes } from "@/models/ActivityValue";
import { InventoryValueAttributes } from "@/models/InventoryValue";
import {
  DirectMeasure,
  ExtraField,
  findMethodology,
  MANUAL_INPUT_HIERARCHY,
  Methodology,
} from "@/util/form-schema";
import createHttpError from "http-errors";
import { db } from "@/models";
import { Sequelize } from "sequelize";

export enum ValidationErrorCodes {
  EXCLUSIVE_CONFLICT = "EXCLUSIVE_CONFLICT", // trying to insert a value when a blanket value like ""
  EXCLUSIVE_CONFLICT_SECONDARY = "EXCLUSIVE_CONFLICT_SECONDARY",
  UNIQUE_BY_CONFLICT = "UNQUE_BY_CONFLICT",
  REQUIRED_FIELD_MISSING = "REQUIRED_FIELD_MISSING",
}

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
    } else {
      methodology = findMethodology(methodologyId, referenceNumber);
      // check if the methodology exists
      if (!methodology) {
        throw new Error(`Methodology ${methodologyId} not found`);
      }
    }

    // extract extra fields from the methodology
    let extraFields =
      (methodology as Methodology)?.activities?.[0]?.["extra-fields"] ||
      (methodology as DirectMeasure)["extra-fields"];

    if (extraFields && extraFields.length > 0) {
      // handle required fields validation
      await this.requiredFieldValidation({
        activityData: activityValueParams.activityData as Record<string, any>,
        requiredFields: extraFields
          .filter((field) => !field.required)
          .map((f) => f.id),
      });

      // handle exclusive fields validation
      await this.exclusiveFieldValidation({
        activityData: activityValueParams.activityData as Record<string, any>,
        exclusiveFieldValue: extraFields
          .filter((field) => field.exclusive)
          .map((f) => ({ id: f.id, value: f.exclusive as string })),
      });
    }

    let activityRules = (methodology as Methodology).activities;

    // handle non direct measure methodologies
    if (activityRules && activityRules.length > 0) {
      let activityRule = activityRules[0];
      let uniqueBy = activityRule["unique-by"];
      if (uniqueBy) {
        await this.uniqueByValidation({
          uniqueBy,
          activityValueParams,
        });
      }
    }
  }

  private static async requiredFieldValidation({
    activityData,
    requiredFields,
  }: {
    activityData: Record<string, any>;
    requiredFields: string[];
  }) {
    let missingFields: string[] = [];

    for (const field of requiredFields) {
      if (!activityData[field]) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      const errorBody = {
        isValid: false,
        code: ValidationErrorCodes.REQUIRED_FIELD_MISSING,
        targetFields: missingFields,
      };

      throw new createHttpError.BadRequest(
        JSON.stringify({ details: errorBody }),
      );
    }
  }

  private static async uniqueByValidation({
    uniqueBy,
    activityValueParams,
  }: {
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    uniqueBy: string[];
  }) {
    let duplicateFields: string[] = [];

    const whereClause = uniqueBy.reduce(
      (acc, field) => {
        acc[`activityData.${field}`] =
          activityValueParams.activityData?.[field];
        return acc;
      },
      {} as { [key: string]: any },
    );

    // Perform the validation
    const existingRecord = await db.models.ActivityValue.findOne({
      where: whereClause,
    });

    if (existingRecord) {
      duplicateFields = uniqueBy.filter(
        (field) =>
          existingRecord.activityData?.[field] ===
          activityValueParams.activityData?.[field],
      );

      const errorBody = {
        isValid: false,
        code: ValidationErrorCodes.UNIQUE_BY_CONFLICT,
        targetFields: duplicateFields,
      };

      throw errorBody;
    }
    // check if the uniqueBy fields are unique
  }

  private static async exclusiveFieldValidation({
    activityData,
    exclusiveFieldValue,
  }: {
    activityData: Record<string, any>;
    exclusiveFieldValue: { id: string; value: string }[];
  }) {
    console.log(
      "got here",
      exclusiveFieldValue,
      activityData,
      exclusiveFieldValue,
    );
    for (const field of exclusiveFieldValue) {
      const exclusiveValue = field.value;

      if (activityData[field.id] === exclusiveValue) {
        // check that no other record exists for the same subsector, subsector and methodology
      }

      const existingRecord = await ActivityValue.findOne({
        where: {
          [`activityData.${field.id}`]: exclusiveValue,
        },
      });

      if (existingRecord) {
        const errorBody = {
          isValid: false,
          code: ValidationErrorCodes.EXCLUSIVE_CONFLICT,
          targetField: field.id,
          targetValue: exclusiveValue,
        };

        throw new createHttpError.BadRequest(
          JSON.stringify({ details: errorBody }),
        );
      }
    }
  }
}
