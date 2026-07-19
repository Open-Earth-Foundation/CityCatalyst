import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import type { Transaction } from "sequelize";

import InventoryProgressService from "@/backend/InventoryProgressService";
import VersionHistoryService from "@/backend/VersionHistoryService";
import { db } from "@/models";
import type { Inventory } from "@/models/Inventory";
import type { InventoryValue } from "@/models/InventoryValue";
import { InventoryTypeEnum } from "@/util/constants";

const STATIONARY_ENERGY_SECTOR_REFERENCE = "I";

const validSectorRefNos = {
  [InventoryTypeEnum.GPC_BASIC]: ["I", "II", "III"],
  [InventoryTypeEnum.GPC_BASIC_PLUS]: ["I", "II", "III", "IV", "V"],
};

export const ALLOWED_STATIONARY_ENERGY_NOTATION_KEYS = [
  {
    notation_key: "NO",
    unavailable_reason: "no-occurrance",
    label: "NO",
    meaning: "Not occurring",
  },
  {
    notation_key: "NE",
    unavailable_reason: "not-estimated",
    label: "NE",
    meaning: "Not estimated",
  },
  {
    notation_key: "IE",
    unavailable_reason: "included-elsewhere",
    label: "IE",
    meaning: "Included elsewhere",
  },
  {
    notation_key: "C",
    unavailable_reason: "confidential-information",
    label: "C",
    meaning: "Confidential",
  },
] as const;

export type StationaryEnergyNotationKey =
  (typeof ALLOWED_STATIONARY_ENERGY_NOTATION_KEYS)[number]["notation_key"];

export type StationaryEnergyUnavailableReason =
  (typeof ALLOWED_STATIONARY_ENERGY_NOTATION_KEYS)[number]["unavailable_reason"];

type SaveNotationKeyInput = {
  subCategoryId: string;
  unavailableReason: StationaryEnergyUnavailableReason;
  unavailableExplanation: string;
};

export type CommitStationaryEnergyNotationKeyRow = {
  proposal_id: string;
  decision_version: number;
  target_id: string;
  target_ref: Record<string, unknown>;
  notation_key: StationaryEnergyNotationKey;
  unavailable_explanation: string;
};

type NotationKeyCandidateEntry = {
  inventoryValue?: InventoryValue | null;
  subSector: Record<string, unknown>;
  subCategory: Record<string, unknown>;
};

const notationKeyByCode = new Map(
  ALLOWED_STATIONARY_ENERGY_NOTATION_KEYS.map((entry) => [
    entry.notation_key,
    entry,
  ]),
);

const notationKeyByUnavailableReason = new Map(
  ALLOWED_STATIONARY_ENERGY_NOTATION_KEYS.map((entry) => [
    entry.unavailable_reason,
    entry,
  ]),
);

export function unavailableReasonForNotationKey(
  notationKey: string,
): StationaryEnergyUnavailableReason | null {
  return notationKeyByCode.get(notationKey as StationaryEnergyNotationKey)
    ?.unavailable_reason ?? null;
}

export async function listNotationKeyCandidateGroups(params: {
  inventory: Inventory;
  sectorReferenceNumbers?: string[];
}): Promise<Record<string, NotationKeyCandidateEntry[]>> {
  const existingInventoryValues = await db.models.InventoryValue.findAll({
    where: {
      inventoryId: params.inventory.inventoryId,
    },
  });

  const inventoryValuesBySubCategoryId = new Map(
    existingInventoryValues
      .filter((value) => value.subCategoryId != null)
      .map((value) => [value.subCategoryId, value]),
  );
  const inventoryValuesByGpcRef = new Map(
    existingInventoryValues
      .filter((value) => value.gpcReferenceNumber != null)
      .map((value) => [value.gpcReferenceNumber, value]),
  );

  const inventoryStructure =
    await InventoryProgressService.getSortedInventoryStructure();
  const requestedSectorRefs = new Set(params.sectorReferenceNumbers);
  const applicableSectors = inventoryStructure.filter((sector) => {
    if (!sector.referenceNumber) {
      return false;
    }
    if (requestedSectorRefs.size > 0 && !requestedSectorRefs.has(sector.referenceNumber)) {
      return false;
    }

    const inventoryType =
      params.inventory.inventoryType ?? InventoryTypeEnum.GPC_BASIC;
    return validSectorRefNos[inventoryType].includes(sector.referenceNumber);
  });

  return Object.fromEntries(
    applicableSectors.map((sector) => {
      const isSectorIVOrV =
        sector.referenceNumber === "IV" || sector.referenceNumber === "V";
      const entries = isSectorIVOrV
        ? sector.subSectors
            .filter((subSector) => subSector.referenceNumber != null)
            .map((subSector) => {
              const inventoryValue = inventoryValuesByGpcRef.get(
                subSector.referenceNumber!,
              );
              return {
                inventoryValue,
                subSector: {
                  ...subSector,
                  sectorId: sector.sectorId,
                  sectorName: sector.sectorName,
                  referenceNumber: sector.referenceNumber,
                },
                subCategory: {
                  subcategoryId: subSector.subsectorId,
                  subcategoryName: subSector.subsectorName,
                  referenceNumber: subSector.referenceNumber!,
                  subsectorId: subSector.subsectorId,
                  scopeId: subSector.scopeId,
                  reportinglevelId: null,
                },
              };
            })
        : sector.subSectors.flatMap((subSector) =>
            subSector.subCategories.map((subCategory) => {
              const inventoryValue = inventoryValuesBySubCategoryId.get(
                subCategory.subcategoryId,
              );
              return {
                inventoryValue,
                subSector: {
                  ...subSector,
                  sectorId: sector.sectorId,
                  sectorName: sector.sectorName,
                  referenceNumber: sector.referenceNumber,
                },
                subCategory,
              };
            }),
          );

      return [
        sector.referenceNumber,
        entries.filter(({ inventoryValue }) => {
          const isFilled = inventoryValue != null;
          const hasNotationKey = inventoryValue?.unavailableReason != null;
          return !isFilled || hasNotationKey;
        }),
      ];
    }),
  );
}

export async function listStationaryEnergyNotationKeyTargets(
  inventory: Inventory,
): Promise<Record<string, unknown>> {
  const groups = await listNotationKeyCandidateGroups({
    inventory,
    sectorReferenceNumbers: [STATIONARY_ENERGY_SECTOR_REFERENCE],
  });

  return {
    allowed_notation_keys: ALLOWED_STATIONARY_ENERGY_NOTATION_KEYS,
    targets: (groups[STATIONARY_ENERGY_SECTOR_REFERENCE] ?? []).map((entry) =>
      toStationaryEnergyNotationTarget(entry),
    ),
  };
}

export async function saveInventoryNotationKeys(params: {
  inventoryId: string;
  notationKeys: SaveNotationKeyInput[];
  userId?: string;
}): Promise<InventoryValue[]> {
  return await db.sequelize!.transaction(async (transaction) => {
    const result: InventoryValue[] = [];

    for (const notationKey of params.notationKeys) {
      result.push(
        await upsertNotationKey({
          inventoryId: params.inventoryId,
          notationKey,
          transaction,
        }),
      );
    }

    await VersionHistoryService.bulkCreateVersions(
      params.inventoryId,
      "InventoryValue",
      params.userId,
      result,
      false,
      transaction,
    );

    return result;
  });
}

export async function commitStationaryEnergyNotationKeys(params: {
  inventory: Inventory;
  rows: CommitStationaryEnergyNotationKeyRow[];
  userId: string;
}): Promise<Array<Record<string, unknown>>> {
  const targetsPayload = await listStationaryEnergyNotationKeyTargets(
    params.inventory,
  );
  const eligibleTargetIds = new Set(
    ((targetsPayload.targets as Array<Record<string, unknown>>) ?? [])
      .map((target) => target.target_id)
      .filter((value): value is string => typeof value === "string"),
  );

  const results: Array<Record<string, unknown>> = [];
  for (const row of params.rows) {
    const unavailableReason = unavailableReasonForNotationKey(row.notation_key);
    if (!eligibleTargetIds.has(row.target_id)) {
      results.push(failedNotationResult(row, "Target is not eligible for Stationary Energy notation keys."));
      continue;
    }
    if (!unavailableReason) {
      results.push(failedNotationResult(row, "Unsupported notation key."));
      continue;
    }

    try {
      await saveInventoryNotationKeys({
        inventoryId: params.inventory.inventoryId,
        userId: params.userId,
        notationKeys: [
          {
            subCategoryId: row.target_id,
            unavailableReason,
            unavailableExplanation: row.unavailable_explanation,
          },
        ],
      });
      results.push({
        proposal_id: row.proposal_id,
        decision_version: row.decision_version,
        target_id: row.target_id,
        notation_key: row.notation_key,
        unavailable_reason: unavailableReason,
        status: "committed",
      });
    } catch (error) {
      results.push(
        failedNotationResult(
          row,
          error instanceof Error ? error.message : "Notation key commit failed.",
        ),
      );
    }
  }

  return results;
}

async function upsertNotationKey(params: {
  inventoryId: string;
  notationKey: SaveNotationKeyInput;
  transaction: Transaction;
}): Promise<InventoryValue> {
  const subCategory = await db.models.SubCategory.findOne({
    where: { subcategoryId: params.notationKey.subCategoryId },
    attributes: [
      "subcategoryId",
      "subcategoryName",
      "referenceNumber",
      "subsectorId",
    ],
    include: [
      {
        model: db.models.SubSector,
        as: "subsector",
        attributes: ["sectorId"],
      },
    ],
  });

  let subSector;
  let gpcReferenceNumber: string | undefined;
  let sectorId: string | undefined;
  let subSectorId: string | undefined;

  if (subCategory) {
    gpcReferenceNumber = subCategory.referenceNumber;
    sectorId = subCategory.subsector?.sectorId;
    subSectorId = subCategory.subsectorId;
  } else {
    subSector = await db.models.SubSector.findOne({
      where: { subsectorId: params.notationKey.subCategoryId },
      attributes: [
        "subsectorId",
        "subsectorName",
        "sectorId",
        "referenceNumber",
      ],
    });

    if (!subSector) {
      throw new createHttpError.NotFound(
        `SubCategory or SubSector not found: ${params.notationKey.subCategoryId}`,
      );
    }

    gpcReferenceNumber = subSector.referenceNumber;
    sectorId = subSector.sectorId;
    subSectorId = subSector.subsectorId;
  }

  if (!gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      `Missing reference number for ${params.notationKey.subCategoryId}`,
    );
  }

  const existingInventoryValue = await db.models.InventoryValue.findOne({
    where: {
      inventoryId: params.inventoryId,
      gpcReferenceNumber,
    },
    transaction: params.transaction,
    lock: true,
  });

  if (!existingInventoryValue) {
    return await db.models.InventoryValue.create(
      {
        ...params.notationKey,
        id: randomUUID(),
        subSectorId,
        sectorId,
        inventoryId: params.inventoryId,
        gpcReferenceNumber,
        subCategoryId: subCategory
          ? params.notationKey.subCategoryId
          : undefined,
      },
      { transaction: params.transaction },
    );
  }

  const hasEmissionsData =
    existingInventoryValue.co2eq != null ||
    existingInventoryValue.co2eqYears != null;
  if (hasEmissionsData) {
    const itemName = subCategory
      ? subCategory.subcategoryName
      : subSector?.subsectorName || gpcReferenceNumber;
    const error = new createHttpError.BadRequest(
      `Cannot set notation key for "${itemName}" because it already has emissions data. Please remove the emissions data first.`,
    );
    (error as any).data = {
      translationKey: "error-cannot-set-notation-key-emissions-data",
      itemName,
    };
    throw error;
  }

  const inventoryValue = await existingInventoryValue.update(
    {
      unavailableReason: params.notationKey.unavailableReason,
      unavailableExplanation: params.notationKey.unavailableExplanation,
      subSectorId,
      sectorId,
      co2eq: undefined,
      co2eqYears: undefined,
      datasourceId: null,
      subCategoryId: subCategory ? params.notationKey.subCategoryId : undefined,
    },
    { transaction: params.transaction },
  );

  await db.models.ActivityValue.destroy({
    where: { inventoryValueId: existingInventoryValue.id },
    transaction: params.transaction,
  });

  return inventoryValue;
}

function toStationaryEnergyNotationTarget(
  entry: NotationKeyCandidateEntry,
): Record<string, unknown> {
  const unavailableReason = entry.inventoryValue?.unavailableReason ?? null;
  const notation = unavailableReason
    ? notationKeyByUnavailableReason.get(
        unavailableReason as StationaryEnergyUnavailableReason,
      )
    : null;
  const targetRef = targetRefFromEntry(entry);

  return {
    target_id: String(entry.subCategory.subcategoryId ?? ""),
    target_label: targetLabel(targetRef),
    target_ref: targetRef,
    current_notation_key:
      notation && entry.inventoryValue
        ? {
            notation_key: notation.notation_key,
            unavailable_reason: notation.unavailable_reason,
            unavailable_explanation:
              entry.inventoryValue.unavailableExplanation ?? null,
            inventory_value_id: entry.inventoryValue.id,
          }
        : null,
  };
}

function targetRefFromEntry(
  entry: NotationKeyCandidateEntry,
): Record<string, unknown> {
  return {
    sector_id: entry.subSector.sectorId,
    sector_name: entry.subSector.sectorName,
    sector_reference_number: entry.subSector.referenceNumber,
    subsector_id: entry.subSector.subsectorId,
    subsector_name: entry.subSector.subsectorName,
    subsector_reference_number: entry.subSector.referenceNumber,
    subcategory_id: entry.subCategory.subcategoryId,
    subcategory_name: entry.subCategory.subcategoryName,
    subcategory_reference_number: entry.subCategory.referenceNumber,
    scope_id: entry.subCategory.scopeId,
  };
}

function targetLabel(targetRef: Record<string, unknown>): string {
  return [
    targetRef.subsector_name,
    targetRef.subcategory_name,
    targetRef.scope_id,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" / ");
}

function failedNotationResult(
  row: CommitStationaryEnergyNotationKeyRow,
  issue: string,
): Record<string, unknown> {
  return {
    proposal_id: row.proposal_id,
    decision_version: row.decision_version,
    target_id: row.target_id,
    notation_key: row.notation_key,
    status: "failed",
    issue,
  };
}
