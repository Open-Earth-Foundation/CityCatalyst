import UserService from "@/backend/UserService";
import CDPService from "@/backend/CDPService";

import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { Inventory } from "@/models/Inventory";
import { InventoryValue } from "@/models/InventoryValue";
import { db } from "@/models";
import { Op } from "sequelize";

const EMISSIONS_SECTION = 3;
const EMISSIONS_INVENTORY_QUESTION = 0;
const EMISSIONS_INVENTORY_ANSWER = "Yes";
const EMISSIONS_MATRIX_QUESTION = 2;

function findRow(rows: any[], regex: RegExp): string|null {
  const row = rows.find((row: any) => row.title.match(regex))
  return row ? row.id : null;
}

async function getTotalByRefnos(inventory: Inventory, refNos: string[]): Promise<bigint> {

  let total:bigint = 0n;

  const values = await db.models.InventoryValue.findAll({
    where:
      {
        inventoryId: inventory.inventoryId,
        gpcReferenceNumber: { [Op.in]: refNos }
      }
  });

  for (const value of values) {
    total += (value.co2eq ?? 0n);
  }

  return total;
}

async function totalScope1ExcludingGeneration(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function scope1FromGeneration(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalScope2(inventory: Inventory): Promise<bigint> {
  return await getTotalByRefnos(inventory, [
    "I.1.2", "I.2.2", "I.3.2", "I.4.2", "I.5.2", "I.6.2",
    "II.1.2", "II.2.2", "II.3.2", "II.4.2", "II.5.2"])
}

async function totalScope3(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalStationaryScope1(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalStationaryScope2(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalStationaryScope3(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalTransportationScope1(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalTransportationScope2(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalTransportationScope3(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalWasteWithinScope1(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalWasteWithinScope3(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalWasteOutsideScope1(inventory: Inventory): Promise<bigint> {
  return 0n;
}

async function totalBasic(inventory: Inventory): Promise<bigint> {
  return 0n;
}

export const POST = apiHandler(async (_req, { session, params }) => {

  if (CDPService.mode === "disabled") {
    return NextResponse.json({
      success: false
    });
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
    inventory.city.country
  );

  logger.debug(`Got ${cityId}`);

  let success = false;

  // In test mode, we just need to show that we can get questions and submit a response
  if (CDPService.mode === "test") {
    const questionnaire = await CDPService.getQuestions(cityId);

    logger.debug(`Got questionnaire`);
    logger.debug(`Got ${questionnaire.sections.length} sections`);

    for (let i = 0; i < questionnaire.sections.length; i++) {
      logger.debug(`Got ${questionnaire.sections[i].questions.length} questions for section ${i}`);
      const questions = questionnaire.sections[i].questions;
      for (let j = 0; j < questions.length; j++) {
        const question = questions[j];
        logger.debug(`Got keys ${Object.keys(question).join(", ")}`)
        logger.debug(`Question ${i}.${j} (${question.id}): ${question.text}`);
      }
    }

    const section = questionnaire.sections[EMISSIONS_SECTION];
    const question = section.questions[EMISSIONS_INVENTORY_QUESTION];

    const yes = question.options.find((option: any) => {
      return option.name === EMISSIONS_INVENTORY_ANSWER;
    });

    logger.debug(`Got question: ${JSON.stringify(question)}`);

    const matrix = questionnaire.sections[EMISSIONS_SECTION].questions[EMISSIONS_MATRIX_QUESTION];
    logger.debug(`Got matrix question: ${JSON.stringify(matrix)}`);

    const col = matrix.columns.find((column: any) => {
      return column.text.match(/^Emissions/);
    })

    const rows = [
      { rowId: findRow(matrix.rows, /Total scope 1 emissions.*excluding/),
        content: await totalScope1ExcludingGeneration(inventory) },
      { rowId: findRow(matrix.rows, /[Ss]cope 1 emissions.*from generation/),
        content: await scope1FromGeneration(inventory) },
      { rowId: findRow(matrix.rows, /Total scope 2 emissions/),
        content: await totalScope2(inventory) },
      { rowId: findRow(matrix.rows, /Total scope 3 emissions/),
        content: await totalScope3(inventory) },
      { rowId: findRow(matrix.rows, /Stationary Energy.*scope 1/),
        content: await totalStationaryScope1(inventory) },
      { rowId: findRow(matrix.rows, /Stationary Energy.*scope 2/),
        content: await totalStationaryScope2(inventory) },
      { rowId: findRow(matrix.rows, /Stationary Energy.*scope 3/),
        content: await totalStationaryScope3(inventory) },
      { rowId: findRow(matrix.rows, /Transportation.*scope 1/),
        content: await totalTransportationScope1(inventory) },
      { rowId: findRow(matrix.rows, /Transportation.*scope 2/),
        content: await totalTransportationScope2(inventory) },
      { rowId: findRow(matrix.rows, /Transportation.*scope 3/),
        content: await totalTransportationScope3(inventory) },
      { rowId: findRow(matrix.rows, /Waste.*within.*scope 1/),
        content: await totalWasteWithinScope1(inventory) },
      { rowId: findRow(matrix.rows, /Waste.*within.*scope 3/),
        content: await totalWasteWithinScope3(inventory) },
      { rowId: findRow(matrix.rows, /Waste.*outside.*scope 1/),
        content: await totalWasteOutsideScope1(inventory) },
      { rowId: findRow(matrix.rows, /TOTAL BASIC emissions/),
        content: await totalBasic(inventory) },
    ]

    try {
      success = await CDPService.submitSingleSelect(
        cityId,
        question.id,
        yes.id,
        yes.name
      )
      if (success) {
        success = await CDPService.submitMatrix(
          cityId,
          col.id,
          rows
        );
      }
    } catch (error) {
      logger.error(`Failed to submit response: ${error}`);
      success = false;
    }

  } else if (CDPService.mode === "production") {
    // TODO: Submit total emissions
    // TODO: Submit CIRIS file
    // TODO: Submit emissions matrix
    success = false;
  }

  return NextResponse.json({
    success: success
  });
});
