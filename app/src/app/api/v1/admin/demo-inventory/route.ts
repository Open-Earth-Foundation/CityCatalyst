/**
 * @swagger
 * /api/v1/admin/demo-inventory:
 *   post:
 *     tags:
 *       - admin
 *     operationId: provisionDemoInventory
 *     summary: Provision a completed demo inventory into a project.
 *     description: Creates a demo city and imports a configured demo inventory template. Requires an admin session.
 */
import DemoInventoryService, {
  DEMO_INVENTORY_TEMPLATES,
  DemoInventoryTemplateId,
} from "@/backend/DemoInventoryService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const templateIds = Object.keys(DEMO_INVENTORY_TEMPLATES) as [
  DemoInventoryTemplateId,
  ...DemoInventoryTemplateId[],
];

const provisionDemoInventoryRequest = z.object({
  projectId: z.string().uuid(),
  templateId: z.enum(templateIds),
});

export const POST = apiHandler(async (req, { session }) => {
  const props = provisionDemoInventoryRequest.parse(await req.json());
  const result = await DemoInventoryService.provisionDemoInventory(
    props,
    session,
  );
  return NextResponse.json(result);
});
