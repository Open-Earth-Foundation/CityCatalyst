import AdminService from "@/backend/AdminService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateInventoriesRequest = z.object({
  userEmail: z.string().email(), // Email of the user whose invnetories are to be connected
  cityLocodes: z.array(z.string()).max(100), // List of city locodes
  years: z.array(z.number().int().positive()).max(10), // List of years to create inventories for (can be comma separated input, multiple select dropdown etc., so multiple years can be chosen)
});

export const POST = apiHandler(async (req, { session }) => {
  const props = updateInventoriesRequest.parse(await req.json());
  const result = await AdminService.bulkUpdateInventories(props, session);
  return NextResponse.json(result);
});
