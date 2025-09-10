/**
 * @swagger
 * /api/v0/inventory/{inventory}/cdp:
 *   post:
 *     tags:
 *       - Inventory CDP
 *     summary: Submit inventory emissions to CDP questionnaire
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
import CDPService from "@/backend/CDPService";

import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import { Op } from "sequelize";
import createHttpError from "http-errors";
import { notEmpty } from "@/util/array";

const EMISSIONS_SECTION = 3;
const EMISSIONS_INVENTORY_QUESTION = 0;
const EMISSIONS_INVENTORY_ANSWER = "Yes";
const EMISSIONS_MATRIX_QUESTION = 2;

function findRow(rows: any[], regex: RegExp): string | null {
  const row = rows.find((row: any) => row.title.match(regex));
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

const cdpRows = [
  {
    rowRegex: /Total scope 1 emissions.*excluding/,
    // prettier-ignore
    refNos: [
      "I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.5.1", "I.6.1", "I.7.1", "I.8.1",
      "II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1",
      "III.1.1", "III.2.1", "III.3.1", "III.4.1", "III.1.3", "III.2.3", "III.3.3", "III.4.3"
    ],
  },
  {
    rowRegex: /[Ss]cope 1 emissions.*from generation/,
    refNos: ["I.4.4"],
  },
  {
    rowRegex: /Total scope 2 emissions/,
    // prettier-ignore
    refNos: ["I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2", "II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2"],
  },
  {
    rowRegex: /Total scope 3 emissions/,
    // prettier-ignore
    refNos: [
      "I.1.3", "I.2.3", "I.3.3", "I.4.3", "I.5.3", "I.6.3",
      "II.1.3", "II.2.3", "II.3.3", "II.4.3",
      "III.1.2", "III.2.2", "III.3.2", "III.4.2"
    ],
  },
  {
    rowRegex: /Stationary Energy.*scope 1/,
    // prettier-ignore
    refNos: ["I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.5.1", "I.6.1", "I.7.1", "I.8.1", "I.4.4"],
  },
  {
    rowRegex: /Stationary Energy.*scope 2/,
    refNos: ["I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2"],
  },
  {
    rowRegex: /Stationary Energy.*scope 3/,
    refNos: ["I.1.3", "I.2.3", "I.3.3", "I.4.3", "I.5.3", "I.6.3"],
  },
  {
    rowRegex: /Transportation.*scope 1/,
    refNos: ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"],
  },
  {
    rowRegex: /Transportation.*scope 2/,
    refNos: ["II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2"],
  },
  {
    rowRegex: /Transportation.*scope 3/,
    refNos: ["I.1.3", "I.2.3", "I.3.3", "I.4.3", "I.5.3", "I.6.3"],
  },
  {
    rowRegex: /Waste.*within.*scope 1/,
    refNos: ["III.1.1", "III.2.1", "III.3.1", "III.4.1"],
  },
  {
    rowRegex: /Waste.*within.*scope 3/,
    refNos: ["III.1.2", "III.2.2", "III.3.2", "III.4.2"],
  },
  {
    rowRegex: /Waste.*outside.*scope 1/,
    refNos: ["III.1.3", "III.2.3", "III.3.3", "III.4.3"],
  },
  {
    rowRegex: /TOTAL BASIC emissions/,
    // prettier-ignore
    refNos: [
      "I.1.1", "I.2.1", "I.3.1", "I.4.1", "I.5.1", "I.6.1", "I.7.1", "I.8.1",
      "II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1",
      "III.1.1", "III.2.1", "III.3.1", "III.4.1",
      "I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2",
      "II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2",
      "III.1.2", "III.2.2", "III.3.2", "III.4.2"
    ],
  },
];

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

  const yes = question.options.find((option: any) => {
    return option.name === EMISSIONS_INVENTORY_ANSWER;
  });

  logger.debug(`Got question: ${JSON.stringify(question)}`);

  const matrix =
    questionnaire.sections[EMISSIONS_SECTION].questions[
      EMISSIONS_MATRIX_QUESTION
    ];
  logger.debug(`Got matrix question: ${JSON.stringify(matrix)}`);

  const col = matrix.columns.find((column: any) => {
    return column.text.match(/^Emissions/);
  });

  const rows = (
    await Promise.all(
      cdpRows.map(async (rowData) => {
        const rowId = findRow(matrix.rows, rowData.rowRegex);
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
