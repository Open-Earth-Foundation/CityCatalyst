// ideally this validation service would run before the ActivityService.createActivity or the ActivityService.updateActivity function is called

import { ActivityValue, ActivityValueAttributes } from "@/models/ActivityValue";
import { InventoryValueAttributes } from "@/models/InventoryValue";
import {
  DirectMeasure,
  findMethodology,
  MANUAL_INPUT_HIERARCHY,
  Methodology,
} from "@/util/form-schema";
import { db } from "@/models";
import { Op, literal, fn, col, where } from "sequelize";
import {
  ManualInputValidationError,
  ManualInputValidationErrorCodes,
  ManualValidationErrorDetails,
} from "@/lib/custom-errors/manual-input-error";
import createHttpError from "http-errors";

// validation rules

export default class ManualInputValidationService {
  /**
   * Validate the activity data against the rules defined in the methodology.
   *
   * This method checks that the activity data provided meets the required
   * validation rules before creating or updating an activity. The validation
   * includes checks for required fields, uniqueness, and exclusivity based on
   * the associated inventory value's methodology.
   *
   * @param {string} [inventoryValueId] - The ID of the inventory value that the activity data is associated with.
   *                                      This is required for determining the validation rule and existing data
   *
   *
   * @param {Omit<ActivityValueAttributes, "id">} activityValueParams - The activity data that needs to be validated.
   *                                                                   This includes all the fields of the activityValue
   *
   *
   * @param {string} [activityValueId] - The ID of the existing activity being updated. This is optional and should
   *                                     be provided only when updating an existing activity. If provided, the service
   *                                     will exclude this activity from certain validation checks (like uniqueness
   *                                     and exclusivity) to avoid conflicts with the activity itself.
   */
  public static async validateActivity({
    inventoryValueId,
    activityValueParams,
    activityValueId,
  }: {
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    inventoryValueId?: string;
    activityValueId?: string;
  }) {
    // we wanna compare the activity data with other exisiting activity datas stored in the database belonging to the same inventoryValue
    if (inventoryValueId) {
      let inventoryValue: InventoryValueAttributes | null =
        await db.models.InventoryValue.findByPk(inventoryValueId);

      if (!inventoryValue) {
        throw new createHttpError.NotFound("Inventory value not found");
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
          throw new createHttpError.NotFound(
            `Methodology ${methodologyId} not found`,
          );
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
            .filter((field) => field.required !== false)
            .map((field) => field.id),
        });

        // handle exclusive fields validation
        await this.exclusiveFieldValidation({
          activityData: activityValueParams.activityData as Record<string, any>,
          exclusiveFieldValue: extraFields
            .filter((field) => field.exclusive)
            .map((f) => ({ id: f.id, value: f.exclusive as string })),
          inventoryValueId,
          activityValueId: activityValueId as string,
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
            activityValueId: activityValueId as string,
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
    activityValueId,
  }: {
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    uniqueBy: string[];
    inventoryValueId: string;
    activityValueId?: string;
  }) {
    let duplicateFields: string[] = [];

    // using the LOWER function to make the comparison case insensitive
    const conditions = uniqueBy.map((field) =>
      where(fn("lower", literal(`activity_data_jsonb->>'${field}'`)), {
        [Op.eq]: activityValueParams.activityData?.[field].toLowerCase(),
      }),
    );

    if (activityValueId) {
      conditions.push(where(col("id"), { [Op.ne]: activityValueId }));
    }

    const whereClause = {
      [Op.and]: [...conditions, { inventoryValueId: inventoryValueId }],
    };

    // Perform the validation
    const existingRecord = await db.models.ActivityValue.findOne({
      where: {
        ...whereClause,
      },
    });

    if (existingRecord) {
      duplicateFields = uniqueBy.filter(
        (field) =>
          existingRecord.activityData?.[field].toLowerCase() ===
          activityValueParams.activityData?.[field].toLowerCase(),
      );

      const errorBody = {
        code: ManualInputValidationErrorCodes.UNIQUE_BY_CONFLICT,
        targetFields: duplicateFields,
      };

      throw new ManualInputValidationError(errorBody);
    }
  }

  private static async exclusiveFieldValidation({
    activityData,
    exclusiveFieldValue,
    inventoryValueId,
    activityValueId,
  }: {
    activityData: Record<string, any>;
    exclusiveFieldValue: { id: string; value: string }[];
    inventoryValueId: string;
    activityValueId?: string;
  }) {
    for (const field of exclusiveFieldValue) {
      const exclusiveValue = field.value;
      let errorBody: ManualValidationErrorDetails;
      let existingRecord: ActivityValue | null;
      let code: ManualInputValidationErrorCodes;

      if (activityData[field.id] === exclusiveValue) {
        // check that a record exists with the field that is supposed to be exclusive
        existingRecord = await ActivityValue.findOne({
          where: {
            [`activityData.${field.id}`]: { [Op.ne]: null },
            inventoryValueId: inventoryValueId,
            ...(activityValueId && { id: { [Op.ne]: activityValueId } }),
          },
        });
        code = ManualInputValidationErrorCodes.EXCLUSIVE_CONFLICT_SECONDARY;
      } else {
        existingRecord = await ActivityValue.findOne({
          where: {
            [`activityData.${field.id}`]: exclusiveValue, // Check for the exclusive value
            inventoryValueId: inventoryValueId,
            ...(activityValueId && { id: { [Op.ne]: activityValueId } }),
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
