import UserService from "@/backend/UserService";
import CDPService from "@/backend/CDPService";

import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (_req, { session, params }) => {

  logger.info("POST /inventory/[inventory]/cdp");
  logger.info(`Getting ${params.inventory} inventory`);

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session
  );

  logger.info(`Got ${inventory.inventoryId}`);

  const cityId = await CDPService.getCityID(
    inventory.city.name,
    inventory.city.country
  );

  logger.info(`Got ${cityId}`);

  let success = false;

  // In test mode, we just need to show that we can get questions and submit a response
  if (CDPService.mode === "test") {

    const questionnaire = await CDPService.getQuestions(cityId);

    logger.info(`Got questions`);

    const section = questionnaire.sections[0];
    const question = section.questions[0];

    logger.info(`Got question`);

    success = await CDPService.submitResponse(
      cityId,
      question.id,
      "Test response"
    );
  } else if (CDPService.mode === "production") {
    // TODO: Submit total emissions
    // TODO: Submit CIRIS file
    // TODO: Submit emissions matrix
    success = false;
  }

  return NextResponse.json({
    success: success;
  });
});
