import {
  ACTION_TYPES,
  HIAction,
  HighImpactActionRankingStatus,
  LANGUAGES,
} from "@/util/types";
import { logger } from "@/services/logger";
import { PrioritizerResponse } from "./types";
import { db } from "@/models";
import { getCityContextAndEmissionsData } from "./HiapService";

const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";

export async function startPrioritization(
  contextData: any,
  type: ACTION_TYPES,
): Promise<{ taskId: string }> {
  logger.info("Sending request to prioritizer", JSON.stringify(contextData));

  const body = {
    cityData: contextData,
    prioritizationType: type,
    language: Object.values(LANGUAGES),
  };
  const response = await fetch(
    `${HIAP_API_URL}/prioritizer/v1/start_prioritization`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  logger.info(
    { status: response.status, statusText: response.statusText },
    "startPrioritization response status",
  );
  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText },
      "Failed to start prioritization job",
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
}

export async function checkPrioritizationProgress(
  taskId: string,
): Promise<{ status: string; error?: string }> {
  const url = `${HIAP_API_URL}/prioritizer/v1/check_prioritization_progress/${taskId}`;
  logger.info({ url }, "checkPrioritizationProgress called");
  const response = await fetch(url);
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
}

export async function getPrioritizationResult(
  taskId: string,
): Promise<PrioritizerResponse> {
  const url = `${HIAP_API_URL}/prioritizer/v1/get_prioritization/${taskId}`;
  logger.info({ url }, "getPrioritizationResult called");
  const response = await fetch(url);
  logger.info(
    { status: response.status, statusText: response.statusText },
    "getPrioritizationResult response status",
  );
  if (!response.ok) throw new Error("Failed to fetch job result");
  const json = await response.json();
  logger.info("getPrioritizationResult response received successfully");
  return json;
}

export const startActionPlanJob = async ({
  action,
  cityLocode,
  lng,
  inventoryId,
}: {
  action: HIAction;
  cityLocode: string;
  lng: LANGUAGES;
  inventoryId: string;
}): Promise<{ plan: string; timestamp: string; actionName: string }> => {
  try {
    // Get city context and emissions data
    const { cityContextData, cityEmissionsData } =
      await getCityContextAndEmissionsData(inventoryId);

    console.log("City:", cityLocode);
    console.log("action:", action);
    console.log("actionId:", action.actionId);

    const payload = {
      cityData: {
        cityContextData,
        cityEmissionsData,
      },
      countryCode: cityLocode.split(" ")[0],
      actionId: action.actionId,
      language: lng,
    };

    console.log("Sending request to start plan creation:", {
      url: `${HIAP_API_URL}/plan-creator/v1/start_plan_creation`,
      payload,
    });

    // Step 1: Start plan creation and get task ID
    const startResponse = await fetch(
      `${HIAP_API_URL}/plan-creator/v1/start_plan_creation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    console.log("Start plan creation response status:", startResponse.status);
    console.log("Start plan creation response:", startResponse);
    console.log(
      "Start plan creation response headers:",
      Object.fromEntries(startResponse.headers.entries()),
    );

    // Log the raw response for debugging
    const responseText = await startResponse.text();
    console.log("Raw API Response:", responseText);

    if (!startResponse.ok) {
      throw new Error(`Failed to start plan generation: ${responseText}`);
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log("Response data:", responseData);
    } catch (e) {
      console.error("Failed to parse JSON response:", e);
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    const task_id = responseData.taskId;
    console.log("Task ID:", task_id);
    if (!task_id) {
      throw new Error(
        `No task_id in response: ${JSON.stringify(responseData)}`,
      );
    }

    console.log("Successfully started plan creation with task_id:", task_id);

    // Step 2: Poll for completion
    let status = "pending";
    let attempts = 0;
    const maxAttempts = 30; // Maximum 30 attempts
    const pollInterval = 10000; // 10 seconds between attempts

    while (status === "pending" || status === "running") {
      console.log(
        `Checking progress for task ${task_id}, attempt ${
          attempts + 1
        } of ${maxAttempts}`,
      );

      const statusResponse = await fetch(
        `${HIAP_API_URL}/plan-creator/v1/check_progress/${task_id}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      console.log("Check progress response status:", statusResponse.status);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error("Check progress error:", errorText);
        throw new Error(`Failed to check progress: ${errorText}`);
      }

      const statusData = await statusResponse.json();
      console.log("Check progress response:", statusData);

      status = statusData.status;

      if (status === "failed") {
        throw new Error(statusData.error || "Plan generation failed");
      }

      if (status === "pending" || status === "running") {
        if (attempts >= maxAttempts) {
          throw new Error("Plan generation timed out after 5 minutes");
        }
        console.log(
          `Waiting ${pollInterval / 1000} seconds before next check...`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval)); // Poll every 10 seconds
        attempts++;
      }
    }

    console.log(`Plan generation completed with status: ${status}`);

    // Step 3: Get the generated plan
    console.log(`Fetching plan for task ${task_id}`);

    const planResponse = await fetch(
      `${HIAP_API_URL}/plan-creator/v1/get_plan/${task_id}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    console.log("Get plan response status:", planResponse.status);

    if (!planResponse.ok) {
      const errorText = await planResponse.text();
      console.error("Get plan error:", errorText);
      throw new Error(`Failed to retrieve plan: ${errorText}`);
    }

    const plan = await planResponse.text();
    console.log("Successfully retrieved plan");

    // Update state with the generated plan
    return {
      plan,
      timestamp: new Date().toISOString(),
      actionName: action.name, // Use the action name
    };
  } catch (error) {
    console.error("Error generating plan:", error);
    throw new Error(`Failed to generate plan: ${error}`);
  }
};
