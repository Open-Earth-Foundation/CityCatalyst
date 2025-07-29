import { apiHandler } from "@/util/api";
import { LANGUAGES } from "@/util/types";
import { ACTION_TYPES } from "@/util/types";
import { fetchRanking } from "@/backend/hiap/HiapService";
import { NextRequest } from "next/server";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";

export const GET = apiHandler(async (req: NextRequest, { params, session }) => {
  if (!session) {
    throw new Error("Unauthorized");
  }

  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("actionType") as ACTION_TYPES;
  const lng = searchParams.get("lng") as LANGUAGES;
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (!type || !lng) {
    throw new Error("Missing required parameters: type and lang");
  }

  try {
    const data = await fetchRanking(params.inventory, type, lng);
    return Response.json({data});
  } catch (error) {
    logger.error("Error fetching HIAP data:", { err: error, inventory: params.inventory, type, lng });
    throw new Error(
      `Failed to fetch HIAP data for city ${inventory.city.locode}: ${(error as Error).message}`,
      { cause: error },
    );
  }
});