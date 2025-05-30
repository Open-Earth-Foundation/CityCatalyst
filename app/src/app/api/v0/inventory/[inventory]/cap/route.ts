import { apiHandler } from "@/util/api";
import { LANGUAGES } from "@/util/types";
import { ACTION_TYPES } from "@/util/types";
import { readFile } from "@/backend/CapService";
import { NextRequest } from "next/server";
import UserService from "@/backend/UserService";

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
  //console.log(JSON.stringify(inventory, null, 2));

  if (!type || !lng) {
    throw new Error("Missing required parameters: type and lang");
  }

  try {
    console.log("locode", inventory.city.locode);
    const data = await readFile(inventory.city.locode!, type, lng);
    return Response.json({ data });
  } catch (error) {
    logger.error({ err: error }, "Error fetching CAP data:");
    throw new Error(`Failed to fetch CAP data for city ${inventory.city.locode}: ${(error as Error).message}`, { cause: error });
  }
});