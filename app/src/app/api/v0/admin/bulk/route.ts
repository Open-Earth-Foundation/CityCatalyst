import AdminService from "@/backend/AdminService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const createBulkInventoriesRequest = z.object({
  cityLocodes: z.array(z.string()), // List of city locodes
  emails: z.array(z.string().email()), // Comma separated list of emails to invite to the all of the created inventories
  years: z.array(z.number().int().positive()), // List of years to create inventories for (can be comma separated input, multiple select dropdown etc., so multiple years can be chosen)
  scope: z.enum(["gpc_basic", "gpc_basic_plus"]), // Scope selection (gpc_basic or gpc_basic_plus)
  gwp: z.enum(["AR5", "AR6"]), // GWP selection (AR5 or AR6)
});

export const POST = apiHandler(async (req, { session }) => {
  const props = createBulkInventoriesRequest.parse(await req.json());
  const result = await AdminService.createBulkInventories(props, session);
  return NextResponse.json(result);
});
