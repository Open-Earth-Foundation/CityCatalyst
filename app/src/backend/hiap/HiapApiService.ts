import { ACTION_TYPES, LANGUAGES } from "@/util/types";
import { logger } from "@/services/logger";
import { PrioritizerResponse } from "./types";

const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";
logger.info("Using HIAP API at", HIAP_API_URL);

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
  logger.info({ json }, "startPrioritization response JSON");
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
  logger.info({ json }, "checkPrioritizationProgress response JSON");
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
  logger.info({ json }, "getPrioritizationResult response JSON");
  return json;
}
