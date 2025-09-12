/**
 * @swagger
 * /api/v0/mock:
 *   get:
 *     tags:
 *       - Mock
 *     summary: Return a small authenticated mock dataset.
 *     description: Returns a static list of mock building fuel/emissions rows. Requires a signed‑in session; unauthorized requests receive 401. Response is wrapped in { data: Row[] }.
 *     responses:
 *       200:
 *         description: Mock rows wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       buildingTpe: { type: string }
 *                       fuelType: { type: string }
 *                       dataQuality: { type: string }
 *                       fuelConsumption: { type: number }
 *                       emissions: { type: number }
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     - { id: 1, buildingTpe: "Commercial building", fuelType: "All Fuels", dataQuality: "Medium", fuelConsumption: 24.4, emissions: 1000 }
 *       401:
 *         description: Unauthorized.
 *   post:
 *     tags:
 *       - Mock
 *     summary: Echo a simple mock response for authenticated users.
 *     description: Returns a static object for testing write endpoints. Requires a signed‑in session; unauthorized requests receive 401. Response is wrapped in { data }.
 *     responses:
 *       200:
 *         description: Mock response wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: string }
 *             examples:
 *               example:
 *                 value:
 *                   data: "Users"
 *       401:
 *         description: Unauthorized.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  return NextResponse.json({
    data: [
      {
        id: 1,
        buildingTpe: "Commercial building",
        fuelType: "All Fuels",
        dataQuality: "Medium",
        fuelConsumption: 24.4,
        emissions: 1000,
      },
      {
        id: 2,
        buildingTpe: "Commercial building",
        fuelType: "Natural Gas",
        dataQuality: "Medium",
        fuelConsumption: 134.4,
        emissions: 2000,
      },
      {
        id: 3,
        buildingTpe: "Commercial building",
        fuelType: "Natural Gas",
        dataQuality: "Medium",
        fuelConsumption: 134.4,
        emissions: 2000,
      },
    ],
  });
});

export const POST = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  return NextResponse.json({ data: "Users" });
});
