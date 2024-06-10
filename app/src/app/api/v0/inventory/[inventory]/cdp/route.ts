import UserService from "@/backend/UserService";
import CDPService from "@/backend/CDPService";

import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

const EMISSIONS_SECTION = 3;
const EMISSIONS_INVENTORY_QUESTION = 0;
const EMISSIONS_INVENTORY_ANSWER = "Yes";
const EMISSIONS_MATRIX_QUESTION = 2;

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

    try {
      success = await CDPService.submitSingleSelect(
        cityId,
        question.id,
        yes.id,
        yes.name
      )
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
