import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { groupBy } from "lodash";

import VersionHistoryService from "@/backend/VersionHistoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory_Sector_Hierarchy } from "@/backend/InventoryProgressService";
import createHttpError from "http-errors";
import { logger } from "@/services/logger";
import type { SubSector } from "@/models/SubSector";
import { db } from "@/models";
import { Op } from "sequelize";

function findSubSector(subSectorId: string): SubSector {
  const subSectors = Inventory_Sector_Hierarchy.flatMap(
    (sector) => sector.subSectors,
  );
  const subSector = subSectors.find(
    (subSector) => subSector.subsectorId === subSectorId,
  );

  if (!subSector) {
    logger.error({ subSectorId }, "Sub-sector not found for version history!");
    throw new createHttpError.NotFound("sub-sector-not-found");
  }

  return subSector;
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
    attributes: ["datasourceName", "datasetName"],
  });

  // add metadata required by frontend to version history data
  const versions = inventoryValueVersions.map((version) => ({
    version,
    activities: version.entryId && activitiesByInventoryValue[version.entryId],
    subSector: findSubSector(version.data?.subSectorId),
    dataSource: dataSources.find(
      (source) => source.datasourceId === version.data?.datasourceId,
    ),
    previousDataSource: version.previousVersion
      ? dataSources.find(
          (source) =>
            source.datasourceId === version.previousVersion.data?.datasourceId,
        )
      : undefined,
  }));

  return NextResponse.json({
    data: versions,
  });
});
