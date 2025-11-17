import {
  ACTION_TYPES,
  HIAction,
  HighImpactActionRankingStatus,
  LANGUAGES,
} from "@/util/types";
import { logger } from "@/services/logger";
import {
  PrioritizerResponse,
  PrioritizerResponseBulk,
  PrioritizerCityData,
} from "./types";
import { db } from "@/models";
import { hiapServiceWrapper } from "./HiapService";
import ActionPlanService from "@/backend/hiap/ActionPlanService";
import ActionPlanEmailService from "@/backend/ActionPlanEmailService";
import { ActionPlan } from "@/models/ActionPlan";

const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";

// Wrapper object for external API calls that need to be mocked in tests
// These are the actual 3rd-party HTTP calls to the HIAP service
export const hiapApiWrapper: {
  startPrioritization: (
    contextData: any,
    type: ACTION_TYPES,
    langs: LANGUAGES[],
  ) => Promise<{ taskId: string }>;
  checkPrioritizationProgress: (
    taskId: string,
  ) => Promise<{ status: string; error?: string }>;
  getPrioritizationResult: (taskId: string) => Promise<PrioritizerResponse>;
  startBulkPrioritization: (
    citiesData: PrioritizerCityData[],
    type: ACTION_TYPES,
    languages: LANGUAGES[],
  ) => Promise<{ taskId: string }>;
  checkBulkPrioritizationProgress: (
    taskId: string,
  ) => Promise<{ status: string; error?: string }>;
  getBulkPrioritizationResult: (
    taskId: string,
  ) => Promise<PrioritizerResponseBulk>;
  startActionPlanJob: (params: {
    action: HIAction;
    cityId: string;
    cityLocode: string;
    lng: LANGUAGES;
    inventoryId: string;
    createdBy?: string;
  }) => Promise<{ plan: string; timestamp: string; actionName: string }>;
  translateActionPlan: (
    inputPlan: ActionPlan,
    inputLanguage: string,
    outputLanguage: string,
  ) => Promise<ActionPlan>;
} = {
  startPrioritization: async (contextData, type, langs) => {
    return await startPrioritizationImpl(contextData, type, langs);
  },
  checkPrioritizationProgress: async (taskId) => {
    return await checkPrioritizationProgressImpl(taskId);
  },
  getPrioritizationResult: async (taskId) => {
    return await getPrioritizationResultImpl(taskId);
  },
  startBulkPrioritization: async (citiesData, type, languages) => {
    return await startBulkPrioritizationImpl(citiesData, type, languages);
  },
  checkBulkPrioritizationProgress: async (taskId) => {
    return await checkBulkPrioritizationProgressImpl(taskId);
  },
  getBulkPrioritizationResult: async (taskId) => {
    return await getBulkPrioritizationResultImpl(taskId);
  },
  startActionPlanJob: async (params) => {
    return await startActionPlanJobImpl(params);
  },
  translateActionPlan: async (inputPlan, inputLanguage, outputLanguage) => {
    return await translateActionPlanImpl(
      inputPlan,
      inputLanguage,
      outputLanguage,
    );
  },
};

function makeHIAPRequest(
  path: string, // starting with /
  method: string = "GET",
  body: Record<string, any> = {},
): Promise<any> {
  const url = HIAP_API_URL + path;

  if (method === "GET") {
    return fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": process.env.HIAP_API_KEY ?? "",
      },
    });
  }

  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.HIAP_API_KEY ?? "",
    },
    body: JSON.stringify(body),
  });
}

/** This Service works with the AI API. In development, run kubectl port-forward svc/hiap-service-dev 8080:80 to access it. */
const startPrioritizationImpl = async (
  contextData: any,
  type: ACTION_TYPES,
  langs: LANGUAGES[],
): Promise<{ taskId: string }> => {
  logger.info({ contextData, langs }, "Sending request to prioritizer");

  const body = {
    cityData: contextData,
    prioritizationType: type,
    language: langs,
  };

  // Log detailed request payload
  logger.info(
    {
      url: `${HIAP_API_URL}/prioritizer/v1/start_prioritization`,
      body: body,
      bodyJson: JSON.stringify(body, null, 2),
      contextDataKeys: Object.keys(contextData),
      cityContextData: contextData.cityContextData,
      cityEmissionsData: contextData.cityEmissionsData,
    },
    "🔍 DETAILED startPrioritization request payload",
  );

  const response = await makeHIAPRequest(
    "/prioritizer/v1/start_prioritization",
    "POST",
    body,
  );
  logger.info(
    { status: response.status, statusText: response.statusText },
    "startPrioritization response status",
  );
  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        requestBody: body,
        requestBodyJson: JSON.stringify(body, null, 2),
      },
      "❌ Failed to start prioritization job - DETAILED ERROR",
    );
    throw new Error(
      `Failed to start prioritization job: ${response.status} ${response.statusText}`,
    );
  }
  const json = await response.json();
  logger.info("startPrioritization response received successfully");
  const { taskId } = json;
  if (!taskId) throw new Error("No taskId returned from HIAP API");
  return { taskId };
};

/** This Service works with the AI API. In development, run kubectl port-forward svc/hiap-service-dev 8080:80 to access it. */
const checkPrioritizationProgressImpl = async (
  taskId: string,
): Promise<{ status: string; error?: string }> => {
  const url = `/prioritizer/v1/check_prioritization_progress/${taskId}`;
  logger.info({ url }, "checkPrioritizationProgress called");
  const response = await makeHIAPRequest(url);
  logger.info(
    { status: response.status, statusText: response.statusText },
    "checkPrioritizationProgress response status",
  );
  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText, taskId },
      "Failed to check job status",
    );
    throw new Error("Failed to check job status");
  }
  const json = await response.json();
  logger.info("checkPrioritizationProgress response received successfully");
  return json;
};

/** This Service works with the AI API. In development, run kubectl port-forward svc/hiap-service-dev 8080:80 to access it. */
const getPrioritizationResultImpl = async (
  taskId: string,
): Promise<PrioritizerResponse> => {
  const url = `/prioritizer/v1/get_prioritization/${taskId}`;
  logger.info({ url }, "getPrioritizationResult called");
  const response = await makeHIAPRequest(url);
  logger.info(
    { status: response.status, statusText: response.statusText },
    "getPrioritizationResult response status",
  );
  if (!response.ok) throw new Error("Failed to fetch job result");
  const json = await response.json();
  logger.info("getPrioritizationResult response received successfully");
  return json;
};

/** This Service works with the AI API. In development, run kubectl port-forward svc/hiap-service-dev 8080:80 to access it. */
const startActionPlanJobImpl = async ({
  action,
  cityId,
  cityLocode,
  lng,
  inventoryId,
  createdBy,
}: {
  action: HIAction;
  cityId: string;
  cityLocode: string;
  lng: LANGUAGES;
  inventoryId: string;
  createdBy?: string;
}): Promise<{ plan: string; timestamp: string; actionName: string }> => {
  try {
    // Get city context and emissions data
    const { cityContextData, cityEmissionsData } =
      await hiapServiceWrapper.getCityContextAndEmissionsData(inventoryId);

    // Extract country code from LOCODE (first 2 characters)
    const countryCode = cityLocode.substring(0, 2);

    const payload = {
      cityData: {
        cityContextData,
        cityEmissionsData,
      },
      countryCode,
      actionId: action.actionId,
      language: lng,
    };

    // Step 1: Start plan creation and get task ID
    const startResponse = await makeHIAPRequest(
      `/plan-creator/v1/start_plan_creation`,
      "POST",
      payload,
    );

    // Log the raw response for debugging
    const responseText = await startResponse.text();

    if (!startResponse.ok) {
      throw new Error(`Failed to start plan generation: ${responseText}`);
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      logger.error({ error: e }, "Failed to parse JSON response");
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    const task_id = responseData.taskId;
    logger.info("Task ID:", task_id);
    if (!task_id) {
      throw new Error(
        `No task_id in response: ${JSON.stringify(responseData)}`,
      );
    }

    logger.info("Successfully started plan creation with task_id:", task_id);

    // Step 2: Poll for completion
    let status = "pending";
    let attempts = 0;
    const maxAttempts = 30; // Maximum 30 attempts
    const pollInterval = 10000; // 10 seconds between attempts

    while (status === "pending" || status === "running") {
      logger.info(
        `Checking progress for task ${task_id}, attempt ${
          attempts + 1
        } of ${maxAttempts}`,
      );

      const statusResponse = await makeHIAPRequest(
        `/plan-creator/v1/check_progress/${task_id}`,
      );

      logger.info(statusResponse, "Check progress response status:");

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        logger.error({ errorText }, "Check progress error:");
        throw new Error(`Failed to check progress: ${errorText}`);
      }

      const statusData = await statusResponse.json();
      logger.info(statusData, "Check progress response:");

      status = statusData.status;

      if (status === "failed") {
        throw new Error(statusData.error || "Plan generation failed");
      }

      if (status === "pending" || status === "running") {
        if (attempts >= maxAttempts) {
          throw new Error("Plan generation timed out after 5 minutes");
        }
        logger.info(
          `Waiting ${pollInterval / 1000} seconds before next check...`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval)); // Poll every 10 seconds
        attempts++;
      }
    }

    logger.info(`Plan generation completed with status: ${status}`);

    // Step 3: Get the generated plan
    logger.info(`Fetching plan for task ${task_id}`);

    const planResponse = await makeHIAPRequest(
      `/plan-creator/v1/get_plan/${task_id}`,
    );

    logger.info(planResponse, "Get plan response status:");

    if (!planResponse.ok) {
      const errorText = await planResponse.text();
      logger.error({ errorText }, "Get plan error:");
      throw new Error(`Failed to retrieve plan: ${errorText}`);
    }

    const plan = await planResponse.text();
    logger.info("Successfully retrieved plan");

    // Parse the plan data to extract metadata
    let planData;
    try {
      planData = JSON.parse(plan);
    } catch (parseError) {
      logger.error({ error: parseError }, "Failed to parse plan JSON");
      throw new Error("Invalid plan data format");
    }

    // Save action plan to database
    try {
      const { actionPlan, created } = await ActionPlanService.upsertActionPlan({
        cityId,
        actionId: action.actionId,
        highImpactActionRankedId: action.hiaRankingId, // This should be the ranked ID, not ranking ID
        cityLocode,
        actionName: action.name,
        language: lng,
        planData,
        createdBy,
      });

      logger.info(
        { actionPlanId: actionPlan.id, created },
        `Action plan ${created ? "created" : "updated"} in database`,
      );

      // Send email notification if action plan was successfully created
      if (created && createdBy) {
        try {
          const user = await db.models.User.findByPk(createdBy);
          if (user) {
            await ActionPlanEmailService.sendActionPlanReadyEmailWithUrl(
              user,
              action.name,
              planData.metadata?.cityName || cityLocode,
              action.actionId,
              lng,
            );
          }
        } catch (emailError) {
          logger.error(
            { error: emailError },
            "Failed to send action plan email",
          );
          // Continue execution - email failure shouldn't break the API response
        }
      }
    } catch (dbError) {
      logger.error(
        { error: dbError },
        "Failed to save action plan to database",
      );
      // Continue execution - don't fail the API response due to DB issues
    }

    // Update state with the generated plan
    return {
      plan,
      timestamp: new Date().toISOString(),
      actionName: action.name, // Use the action name
    };
  } catch (error) {
    logger.error({ error }, "Error generating plan");
    throw new Error(`Failed to generate plan: ${error}`);
  }
};

/**
 * Start prioritization for multiple cities in bulk using HIAP bulk endpoint
 * All cities are processed in a single batch request
 * Returns a single taskId for the entire bulk job
 */
const startBulkPrioritizationImpl = async (
  citiesData: PrioritizerCityData[],
  type: ACTION_TYPES,
  languages: LANGUAGES[],
): Promise<{ taskId: string }> => {
  // Guard: Ensure citiesData is not empty before accessing first element
  if (citiesData.length === 0) {
    throw new Error("No city data provided for bulk prioritization.");
  }

  logger.info(
    { cityCount: citiesData.length, type, languages },
    "Starting bulk prioritization",
  );

  // Extract and validate country codes from all cities' LOCODEs
  const countryCodes = citiesData.map((city) =>
    city.cityContextData.locode.substring(0, 2),
  );
  const uniqueCountryCodes = Array.from(new Set(countryCodes));
  if (uniqueCountryCodes.length !== 1) {
    throw new Error(
      `Bulk prioritization requires all cities to be from the same country. Found country codes: ${uniqueCountryCodes.join(", ")}`,
    );
  }
  const countryCode = uniqueCountryCodes[0];

  // Log summary of city data being sent to HIAP
  const citiesSummary = citiesData.map((city) => ({
    locode: city.cityContextData.locode,
    population: city.cityContextData.populationSize,
    stationaryEnergy: city.cityEmissionsData.stationaryEnergyEmissions,
    transportation: city.cityEmissionsData.transportationEmissions,
    waste: city.cityEmissionsData.wasteEmissions,
    ippu: city.cityEmissionsData.ippuEmissions,
    afolu: city.cityEmissionsData.afoluEmissions,
  }));
  logger.info({ cities: citiesSummary }, "🔍 City data being sent to HIAP API");

  const body = {
    cityDataList: citiesData,
    countryCode,
    prioritizationType: type,
    language: languages,
  };

  // Log detailed request payload for bulk prioritization
  logger.info(
    {
      url: `${HIAP_API_URL}/prioritizer/v1/start_prioritization_bulk`,
      cityCount: citiesData.length,
      countryCode,
      prioritizationType: type,
      languages,
      firstCity: citiesData[0],
      bodyStructure: {
        cityDataList: `Array[${citiesData.length}]`,
        countryCode,
        prioritizationType: type,
        language: languages,
      },
      sampleCityData: citiesData[0]
        ? {
            cityContextData: citiesData[0].cityContextData,
            cityEmissionsData: citiesData[0].cityEmissionsData,
          }
        : null,
    },
    "🔍 DETAILED startBulkPrioritization request payload",
  );

  const response = await makeHIAPRequest(
    "/prioritizer/v1/start_prioritization_bulk",
    "POST",
    body,
  );

  logger.info(
    { status: response.status, statusText: response.statusText },
    "startBulkPrioritization response status",
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        cityCount: citiesData.length,
        countryCode,
        prioritizationType: type,
        languages,
        firstCityData: citiesData[0],
      },
      "❌ Failed to start bulk prioritization job - DETAILED ERROR",
    );
    throw new Error(
      `Failed to start bulk prioritization job: ${response.status} ${response.statusText}`,
    );
  }

  const json = await response.json();
  logger.info("startBulkPrioritization response received successfully");

  const { taskId } = json;
  if (!taskId) throw new Error("No taskId returned from HIAP bulk API");

  logger.info(
    { taskId, cityCount: citiesData.length },
    "Bulk prioritization started successfully",
  );

  return { taskId };
};

/**
 * Check progress for a bulk prioritization job
 * Uses the HIAP bulk progress endpoint
 */
const checkBulkPrioritizationProgressImpl = async (
  taskId: string,
): Promise<{ status: string; error?: string }> => {
  const url = `/prioritizer/v1/check_prioritization_progress/${taskId}`;
  logger.info({ url, taskId }, "checkBulkPrioritizationProgress called");

  const response = await makeHIAPRequest(url);

  logger.info(
    { status: response.status, statusText: response.statusText },
    "checkBulkPrioritizationProgress response status",
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText, taskId },
      "Failed to check bulk job status",
    );
    throw new Error("Failed to check bulk job status");
  }

  const json = await response.json();
  logger.info("checkBulkPrioritizationProgress response received successfully");

  return json;
};

/**
 * Get prioritization results for a completed bulk job
 * Uses the HIAP bulk get_prioritization_bulk endpoint
 */
const getBulkPrioritizationResultImpl = async (
  taskId: string,
): Promise<PrioritizerResponseBulk> => {
  const url = `/prioritizer/v1/get_prioritization_bulk/${taskId}`;
  logger.info({ url, taskId }, "getBulkPrioritizationResult called");

  const response = await makeHIAPRequest(url);

  logger.info(
    { status: response.status, statusText: response.statusText },
    "getBulkPrioritizationResult response status",
  );

  if (!response.ok) {
    // Handle specific error cases
    if (response.status === 409) {
      throw new Error(
        "Job result not ready yet (409 Conflict). This may indicate the job is still being finalized.",
      );
    }
    if (response.status === 404) {
      throw new Error(
        "Job result not found (404). The job may have expired or the taskId is invalid.",
      );
    }

    // Try to get error details from response
    let errorDetail = "";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorJson.message || "";
    } catch {
      // Ignore JSON parse errors
    }

    throw new Error(
      `Failed to fetch bulk job result: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ""}`,
    );
  }

  const json = await response.json();
  logger.info(
    { cityCount: json.prioritizerResponseList?.length || 0 },
    "getBulkPrioritizationResult response received successfully",
  );

  return json;
};

const translateActionPlanImpl = async (
  inputPlan: ActionPlan,
  inputLanguage: string,
  outputLanguage: string,
): Promise<ActionPlan> => {
  const startResponse = await makeHIAPRequest(
    "/plan-creator/v1/translate_plan",
    "POST",
    { inputPlan, inputLanguage, outputLanguage },
  );

  const startText = await startResponse.text();
  if (!startResponse.ok) {
    throw new Error(`Failed to start translation: ${startText}`);
  }

  let startJson: any;
  try {
    startJson = JSON.parse(startText);
  } catch (e) {
    throw new Error(`Invalid JSON from translate_plan: ${startText}`);
  }

  const taskId: string | undefined = startJson.taskId;
  if (!taskId) {
    throw new Error("No taskId returned from translate_plan");
  }

  let status = "pending";
  let attempts = 0;
  const maxAttempts = 30;
  const pollIntervalMs = 5000;
  while (status === "pending" || status === "running") {
    const statusResp = await makeHIAPRequest(
      `/plan-creator/v1/check_progress/${taskId}`,
    );
    if (!statusResp.ok) {
      const txt = await statusResp.text();
      throw new Error(`Failed to check translation status: ${txt}`);
    }
    const statusJson = await statusResp.json();
    status = statusJson.status;
    if (status === "failed") {
      throw new Error(statusJson.error || "Plan translation failed");
    }
    if (status === "pending" || status === "running") {
      if (attempts >= maxAttempts) {
        throw new Error("Plan translation timed out");
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      attempts += 1;
    }
  }

  const planResp = await makeHIAPRequest(`/plan-creator/v1/get_plan/${taskId}`);
  const planText = await planResp.text();
  if (!planResp.ok) {
    throw new Error(`Failed to fetch translated plan: ${planText}`);
  }
  let planJson: ActionPlan;
  try {
    planJson = JSON.parse(planText);
  } catch (e) {
    throw new Error(`Invalid translated plan JSON: ${planText}`);
  }
  return planJson;
};
