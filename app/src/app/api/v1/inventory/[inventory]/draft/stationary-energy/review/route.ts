/**
 * @swagger
 * /api/v1/inventory/{inventory}/draft/stationary-energy/review:
 *   post:
 *     tags:
 *       - inventory
 *       - drafts
 *     operationId: reviewStationaryEnergyDrafts
 *     summary: Accept, override, or leave Stationary Energy draft proposals.
 *     description: Applies accepted or source-overridden proposals through DataSourceService.applySource and records user decisions in the proposal staging table. Manual overrides are staged for manual-entry follow-up.
 */
import AgenticInventoryDraftService from "@/backend/AgenticInventoryDraftService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const reviewDecisionSchema = z
  .object({
    proposalId: z.string().min(1),
    subsectorCode: z.string().min(1),
    action: z.enum(["accept", "override", "leave_draft"]),
    selectedSourceId: z.string().uuid().optional(),
    selectedSourceName: z.string().min(1).optional(),
    overrideValue: z.number().optional(),
    overrideUnit: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .superRefine((decision, ctx) => {
    if (decision.action === "override") {
      const hasSourceOverride =
        !!decision.selectedSourceId || !!decision.selectedSourceName;
      const hasManualOverride =
        decision.overrideValue != null && !!decision.overrideUnit;
      if (!hasSourceOverride && !hasManualOverride) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "override requires a selected source or a manual override value and unit",
        });
      }
      return;
    }

    if (
      decision.selectedSourceId ||
      decision.selectedSourceName ||
      decision.overrideValue != null ||
      decision.overrideUnit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "accept and leave_draft must not include override fields",
      });
    }
  });

const reviewRequestSchema = z.object({
  cityId: z.string().uuid(),
  sectorCode: z.literal("I"),
  decisions: z.array(reviewDecisionSchema).min(1),
});

export const POST = apiHandler(async (req, { params, session }) => {
  const body = reviewRequestSchema.parse(await req.json());
  await PermissionService.canEditInventory(session, params.inventory);

  const models = db.models as any;
  const inventory = await models.Inventory.findByPk(params.inventory, {
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  if (inventory.cityId !== body.cityId) {
    throw new createHttpError.BadRequest(
      "Route cityId does not match the inventory city",
    );
  }

  const result = await AgenticInventoryDraftService.applyReviewDecisions({
    inventory,
    decisions: body.decisions,
    userId: session?.user.id,
  });

  return NextResponse.json({ data: result });
});
