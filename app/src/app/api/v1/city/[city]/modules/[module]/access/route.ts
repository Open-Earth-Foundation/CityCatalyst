/**
 * @swagger
 * /api/v1/city/{city}/modules/{module}/access:
 *   get:
 *     tags:
 *       - City Modules
 *     operationId: getCityModulesModuleAccess
 *     summary: Check if user has access to a specific module for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Access flag returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     hasAccess:
 *                       type: boolean
 *                       description: Whether the user has access to the specified module
 */
import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { z } from "zod";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
  module: z.string().uuid("Module ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { city: cityId, module: moduleId } = paramsSchema.parse(context.params);
  const { session } = context;

  const city = await UserService.findUserCity(cityId, session);

  const hasAccess = await ModuleAccessService.hasModuleAccess(
    city.project.projectId,
    moduleId,
  );
  return NextResponse.json({
    data: {
      hasAccess,
    },
  });
});
