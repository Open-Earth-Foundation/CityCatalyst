import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { groupBy } from "lodash";

import VersionHistoryService from "@/backend/VersionHistoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory_Sector_Hierarchy } from "@/backend/InventoryProgressService";
import createHttpError from "http-errors";
import { logger } from "@/services/logger";
import { db } from "@/models";
import { Op } from "sequelize";
import type { SubCategory } from "@/models/SubCategory";

function findSubCategory(subCategoryId: string): SubCategory {
  const subCategories = Inventory_Sector_Hierarchy.flatMap((sector) =>
    sector.subSectors.flatMap((subSector) => subSector.subCategories),
  );
  const subCategory = subCategories.find(
    (subCategory) => subCategory.subcategoryId === subCategoryId,
  );

  if (!subCategory) {
    logger.error(
      { subCategoryId },
      "Sub-category not found for version history!",
    );
    throw new createHttpError.NotFound("sub-category-not-found");
  }

  return subCategory;
}

/**
 * @swagger
 * /api/v1/inventory/{inventory}/version-history:
 *   get:
 *     tags:
 *       - inventory
 *       - version-history
 *     operationId: getInventoryVersionHistory
 *     summary: Get data entry history for an inventory
 *     description: Retrieves data entry history information for an inventory, showing changes made by different users over time. Returns aggregated history entries to be shown in UI. Requires authentication and access to the inventory.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventory history entries returned.
 *       401:
 *         description: Access control failed (not allowed).
 *       404:
 *         description: Inventory not found.
 */
export const GET = apiHandler(async (_req, { session, params }) => {
  let inventoryId = params.inventory;

  // perform access control
  await PermissionService.canAccessInventory(session, inventoryId);

  const versionHistory =
    await VersionHistoryService.getVersionHistory(inventoryId);

  const inventoryValueVersions = versionHistory.filter(
    (version) => version.table === "InventoryValue",
  );
  const activityValueVersions = versionHistory.filter(
    (version) => version.table === "ActivityValue",
  );
  const otherVersions = versionHistory.filter(
    (version) => version.table !== "InventoryValue",
  );
  const activitiesByInventoryValue = groupBy(
    activityValueVersions,
    (version) => version.data?.inventoryValueId,
  );
  const dataSourcesUsed = inventoryValueVersions.map(
    (version) => version.data?.datasourceId,
  );

  const dataSources = await db.models.DataSource.findAll({
    where: {
      datasourceId: { [Op.in]: dataSourcesUsed },
    },
    attributes: ["datasourceId", "datasourceName", "datasetName"],
  });

  // add metadata required by frontend to version history data
  const versions = inventoryValueVersions.map((version) => {
    let subCategoryId = version.data?.subCategoryId;
    // try to get the subCategoryId from the previous version if available (necessary for deletes)
    if (!subCategoryId && version.previousVersion?.data) {
      subCategoryId = version.previousVersion.data?.subCategoryId;
    }
    let subCategory = undefined;
    if (subCategoryId) {
      subCategory = findSubCategory(subCategoryId);
    }

    let activities = version.entryId
      ? activitiesByInventoryValue[version.entryId]
      : undefined;

    const dataSource = dataSources.find(
      (source) => source.datasourceId === version.data?.datasourceId,
    );
    const previousDataSource = version.previousVersion
      ? dataSources.find(
          (source) =>
            source.datasourceId === version.previousVersion.data?.datasourceId,
        )
      : undefined;

    const scope = subCategory ? subCategory.scope.scopeName : undefined;
    const mostRecentAssociatedVersion = versionHistory.find(
      (historyVersion) => {
        if (!historyVersion.created || !version.created) {
          return false;
        }
        const timeDelta =
          historyVersion.created?.getTime() - version.created?.getTime();
        return Math.abs(timeDelta) < 100;
      },
    );

    return {
      version,
      activities,
      subCategory,
      dataSource,
      previousDataSource,
      scope,
      mostRecentAssociatedVersion,
    };
  });

  return NextResponse.json({
    data: versions,
  });
});
