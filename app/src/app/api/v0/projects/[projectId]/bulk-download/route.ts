import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import type { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";
import { db } from "@/models";
import CSVDownloadService from "@/backend/CSVDownloadService";
import InventoryDownloadService from "@/backend/InventoryDownloadService";
import { z } from "zod";
import UserService from "@/backend/UserService";

export const GET = apiHandler(async (req, { params, session }) => {
  const lng = req.nextUrl.searchParams.get("lng") || "en";

  let projectId: string;
  try {
    projectId = z.string().uuid().parse(params.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Error(
      `Invalid project ID format: ${params.projectId}. ${message}`,
    );
  }

  // TODO also allow project admins to bulk download all inventories?
  UserService.ensureIsAdmin(session);

  let body: Buffer | null = null;
  let headers: Record<string, string> | null = null;

  const inventories = await db.models.Inventory.findAll({
    attributes: ["inventoryId", "year"],
    include: [
      {
        model: db.models.City,
        as: "city",
        attributes: ["locode", "name", "country", "region"],
        where: { projectId },
      },
    ],
  });

  let expandedHeaderTitles: string[] = [];

  const allInventoryLines = await Promise.all(
    inventories.map(async (inventory) => {
      const { output } = await InventoryDownloadService.queryInventoryData(
        inventory.inventoryId,
        session,
      );

      const { headerTitles, inventoryLines } =
        await CSVDownloadService.extractCSVData(
          output as InventoryWithInventoryValuesAndActivityValues,
          lng,
        );

      if (headerTitles.length > 0 && expandedHeaderTitles.length === 0) {
        expandedHeaderTitles = [
          "City Name",
          "Locode",
          "Region Name",
          "Country Name",
          "Inventory ID",
          "Inventory Year",
          ...headerTitles,
        ];
      }

      const expandedInventoryLines = inventoryLines.map((line) => {
        line.unshift(
          inventory.city.name,
          inventory.city.locode,
          inventory.city.region,
          inventory.city.country,
          inventory.inventoryId,
          inventory.year,
        );
        return line;
      });

      return expandedInventoryLines;
    }),
  );

  const mergedInventoryLines = allInventoryLines.flat();
  body = CSVDownloadService.stringifyCSV(
    expandedHeaderTitles,
    mergedInventoryLines,
  );
  headers = {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="project-${projectId}-inventories.csv"`,
  };

  return new NextResponse(body, { headers });
});
