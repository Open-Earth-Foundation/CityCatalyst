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
import { db } from "@/models";
import { Op } from "sequelize";
import {
  ManualInputValidationError,
  ManualInputValidationErrorCodes,
  ValidationErrorDetails,
} from "@/lib/custom-errors.ts/manual-input-error";

// validation rules

export default class ManualInputValidationService {
  public static async validateActivity({
    inventoryValueId,
    activityValueParams,
  }: {
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    inventoryValueId?: string;
  }) {

    // we wanna compare the activity data with other exisiting activity datas stored in the database belonging to the same inventoryValue
    if (inventoryValueId) {
      let inventoryValue: InventoryValueAttributes | null =
        await db.models.InventoryValue.findByPk(inventoryValueId);

      if (!inventoryValue) {
        throw new Error("Inventory value not found");
      }

      const referenceNumber = inventoryValue.gpcReferenceNumber as string;
      const methodologyId = inventoryValue.inputMethodology as string;

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
            .filter((field) => "required" in field && !field.required)
            .map((f) => f.id),
        });

        // handle exclusive fields validation
        await this.exclusiveFieldValidation({
          activityData: activityValueParams.activityData as Record<string, any>,
          exclusiveFieldValue: extraFields
            .filter((field) => field.exclusive)
            .map((f) => ({ id: f.id, value: f.exclusive as string })),
          inventoryValueId,
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
            inventoryValueId,
          });
        }
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
        code: ManualInputValidationErrorCodes.REQUIRED_FIELD_MISSING,
        targetFields: missingFields,
      };

      throw new ManualInputValidationError(errorBody);
    }
  }

  private static async uniqueByValidation({
    uniqueBy,
    activityValueParams,
    inventoryValueId,
  }: {
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    uniqueBy: string[];
    inventoryValueId: string;
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
      where: {
        ...whereClause,
        inventoryValueId: inventoryValueId,
      },
    });

    if (existingRecord) {
      duplicateFields = uniqueBy.filter(
        (field) =>
          existingRecord.activityData?.[field] ===
          activityValueParams.activityData?.[field],
      );

      const errorBody = {
        code: ManualInputValidationErrorCodes.UNIQUE_BY_CONFLICT,
        targetFields: duplicateFields,
      };

      throw new ManualInputValidationError(errorBody);
    }
    // check if the uniqueBy fields are unique
  }

  private static async exclusiveFieldValidation({
    activityData,
    exclusiveFieldValue,
    inventoryValueId,
  }: {
    activityData: Record<string, any>;
    exclusiveFieldValue: { id: string; value: string }[];
    inventoryValueId: string;
  }) {
    for (const field of exclusiveFieldValue) {
      const exclusiveValue = field.value;
      let errorBody: ValidationErrorDetails;
      let existingRecord: ActivityValue | null;
      let code: ManualInputValidationErrorCodes;

      if (activityData[field.id] === exclusiveValue) {
        // check that a record exists with the field that is supposed to be exclusive
        existingRecord = await ActivityValue.findOne({
          where: {
            [`activityData.${field.id}`]: { [Op.ne]: null },
            inventoryValueId: inventoryValueId,
          },
        });
        code = ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT_SECONDARY;
      } else {
        existingRecord = await ActivityValue.findOne({
          where: {
            [`activityData.${field.id}`]: exclusiveValue, // Check for the exclusive value
            inventoryValueId: inventoryValueId,
          },
        });
        code = ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT;
      }

      if (existingRecord) {
        errorBody = {
          code,
          targetFields: [field.id],
          meta: {
            exclusiveFieldValue: exclusiveValue,
            targetValue: activityData[field.id],
          },
        };

        throw new ManualInputValidationError(errorBody);
      }
    }
  }
}
