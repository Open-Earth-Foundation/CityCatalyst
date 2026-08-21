/**
 * @swagger
 * /api/v1/inventory/{inventory}/cdp:
 *   post:
 *     tags:
 *       - inventory
 *       - cdp
 *     operationId: postInventoryCdp
 *     summary: Submit inventory emissions to CDP questionnaire
 *     description: Submits greenhouse gas inventory emissions data to the Carbon Disclosure Project (CDP) questionnaire. Calculates emissions totals by scope (1, 2, 3) and category (Stationary Energy, Transportation, Waste) using GPC reference numbers, then submits the data to CDP's API. Requires the CDP service to be enabled and configured. Returns success status of the submission.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Submission success status returned.
 *       424:
 *         description: CDP API response error.
 *       500:
 *         description: CDP service disabled.
 */
import UserService from "@/backend/UserService";
import CDPService, { CDPMatrixRow } from "@/backend/CDPService";

import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { cdpEmissionsRows } from "@/util/cdp-emissions-crosswalk";
import { NextResponse } from "next/server";
import { db } from "@/models";
import { Op } from "sequelize";
import createHttpError from "http-errors";
import { notEmpty } from "@/util/array";

const EMISSIONS_SECTION = 3;
const EMISSIONS_INVENTORY_QUESTION = 0;
const EMISSIONS_INVENTORY_ANSWER = "Yes";
const EMISSIONS_MATRIX_QUESTION = 2;

function findRow(rows: CDPMatrixRow[], regex: RegExp): string | null {
  const row = rows.find((row) => row.title.match(regex));
  return row ? row.id : null;
}

async function getTotalByRefnos(
  inventoryId: string,
  refNos: string[],
): Promise<bigint> {
  let total: bigint = 0n;

  const values = await db.models.InventoryValue.findAll({
    where: {
      inventoryId,
      gpcReferenceNumber: { [Op.in]: refNos },
    },
  });

  for (const value of values) {
    total += value.co2eq ?? 0n;
  }

  return total;
}

export const POST = apiHandler(async (_req, { session, params }) => {
  if (CDPService.mode === "disabled") {
    throw new createHttpError.InternalServerError(
      "CDP service is disabled. Set env var CDP_MODE to test or production.",
    );
  }

  logger.debug("POST /inventory/[inventory]/cdp");
  logger.debug(`Getting ${params.inventory} inventory`);

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  logger.debug(`Got ${inventory.inventoryId}`);

  const cityId = await CDPService.getCityID(
    inventory.city.name,
    inventory.city.country,
  );

  logger.debug(`Got ${cityId}`);

  let success = false;

  const questionnaire = await CDPService.getQuestions(cityId);

  logger.debug(`Got questionnaire`);
  logger.debug(`Got ${questionnaire.sections.length} sections`);

  for (let i = 0; i < questionnaire.sections.length; i++) {
    logger.debug(
      `Got ${questionnaire.sections[i].questions.length} questions for section ${i}`,
    );
    const questions = questionnaire.sections[i].questions;
    for (let j = 0; j < questions.length; j++) {
      const question = questions[j];
      logger.debug(`Got keys ${Object.keys(question).join(", ")}`);
      logger.debug(`Question ${i}.${j} (${question.id}): ${question.text}`);
    }
  }

  const section = questionnaire.sections[EMISSIONS_SECTION];
  const question = section.questions[EMISSIONS_INVENTORY_QUESTION];

  const yes = question.options?.find((option) => {
    return option.name === EMISSIONS_INVENTORY_ANSWER;
  });
  if (!yes) {
    throw new createHttpError.FailedDependency(
      `CDP questionnaire is missing the "${EMISSIONS_INVENTORY_ANSWER}" option for question ${question.id}`,
    );
  }

  logger.debug(`Got question: ${JSON.stringify(question)}`);

  const matrix =
    questionnaire.sections[EMISSIONS_SECTION].questions[
      EMISSIONS_MATRIX_QUESTION
    ];
  logger.debug(`Got matrix question: ${JSON.stringify(matrix)}`);

  const col = matrix.columns?.find((column) => {
    return column.text.match(/^Emissions/);
  });
  if (!col) {
    throw new createHttpError.FailedDependency(
      `CDP questionnaire matrix is missing an "Emissions" column for question ${matrix.id}`,
    );
  }

  const rows = (
    await Promise.all(
      cdpEmissionsRows.map(async (rowData) => {
        const rowId = findRow(matrix.rows ?? [], rowData.rowRegex);
        if (!rowId) {
          logger.error("Couldn't find row id for: " + rowData.rowRegex);
          return null;
        }
        const content = (
          await getTotalByRefnos(inventory.inventoryId, rowData.refNos)
        ).toString();
        return { rowId, content };
      }),
    )
  ).filter(notEmpty);

  // TODO: Submit CIRIS file

  try {
    success = await CDPService.submitSingleSelect(
      cityId,
      question.id,
      yes.id,
      yes.name,
    );
    if (success) {
      success = await CDPService.submitMatrix(cityId, col.id, rows);
    }
  } catch (error) {
    logger.error(`Failed to submit response: ${error}`);
    throw new createHttpError.FailedDependency(
      "CDP API response error: " + error,
    );
  }

  return NextResponse.json({
    success: success,
  });
});
