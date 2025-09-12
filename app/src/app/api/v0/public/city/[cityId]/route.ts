/**
 * @swagger
 * /api/v0/public/city/{cityId}:
 *   get:
 *     tags:
 *       - Public
 *     summary: Get public city information by ID.
 *     description: Public endpoint that returns city details only if the city has at least one public inventory. No authentication is required. Response is wrapped in { data } and includes basic project/organization branding fields.
 *     parameters:
 *       - in: path
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: City details wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   additionalProperties: true
 *       400:
 *         description: Invalid city ID.
 *       401:
 *         description: No public data available for this city.
 *       404:
 *         description: City not found.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { validate } from "uuid";
import { db } from "@/models";

export const GET = apiHandler(async (req, { params }) => {
  const { cityId } = params;

  if (!validate(cityId)) {
    throw new createHttpError.BadRequest(
      `'${cityId}' is not a valid city id (uuid)`,
    );
  }

  // First check if city has any public inventories before fetching city data
  const hasPublicInventories = await db.models.Inventory.count({
    where: {
      cityId: cityId,
      isPublic: true,
    },
  });

  if (hasPublicInventories === 0) {
    throw new createHttpError.Unauthorized(
      "No public data available for this city",
    );
  }

  // Now fetch the city data since we know it has public inventories
  const city = await db.models.City.findByPk(cityId, {
    include: [
      {
        model: db.models.Project,
        as: "project",
        attributes: ["projectId", "name", "organizationId"],
        include: [
          {
            model: db.models.Organization,
            as: "organization",
            attributes: ["organizationId", "name", "logoUrl", "active"],
            include: [
              {
                model: db.models.Theme,
                as: "theme",
                attributes: ["themeKey"],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  return NextResponse.json({ data: city });
});
