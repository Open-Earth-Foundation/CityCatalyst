import { PrioritizerResponse } from "./HiapService";
import { logger } from "@/services/logger";

const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";
logger.info("Using HIAP API at", HIAP_API_URL);

export async function startPrioritization(contextData: any): Promise<{ taskId: string }> {
  logger.info("Sending request to prioritizer", JSON.stringify(contextData));
  const response = await fetch(
    `${HIAP_API_URL}/prioritizer/v1/start_prioritization`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityData: contextData }),
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Failed to start prioritization job", {
      status: response.status,
      error: errorText,
    });
    throw new Error(
      `Failed to start prioritization job: ${response.status} ${response.statusText}`
    );
  }
  const { taskId } = await response.json();
  if (!taskId) throw new Error("No taskId returned from HIAP API");
  return { taskId };
}

export async function checkPrioritizationProgress(taskId: string): Promise<{ status: string; error?: string }> {
  const response = await fetch(
    `${HIAP_API_URL}/prioritizer/v1/check_prioritization_progress/${taskId}`
  );
  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Failed to check job status", {
      status: response.status,
      error: errorText,
      taskId,
    });
    throw new Error("Failed to check job status");
  }
  return response.json();
}

export async function getPrioritizationResult(taskId: string): Promise<PrioritizerResponse> {
  const response = await fetch(
    `${HIAP_API_URL}/prioritizer/v1/get_prioritization/${taskId}`
  );
  if (!response.ok) throw new Error("Failed to fetch job result");
  return response.json();
} 