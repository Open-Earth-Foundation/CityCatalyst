import createHttpError from "http-errors";
import type { NextRequest } from "next/server";

import type { AppSession } from "@/lib/auth";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export function requireHiapAgenticEnabled(): void {
  if (!hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)) {
    throw new createHttpError.NotFound("Not found");
  }
}

export function requireClimateAdvisorServiceRequest(req: NextRequest): void {
  const serviceName = req.headers.get("X-Service-Name");
  const serviceKey = req.headers.get("X-Service-Key");
  if (
    serviceName !== "climate-advisor" ||
    !serviceKey ||
    serviceKey !== process.env.CC_SERVICE_API_KEY
  ) {
    throw new createHttpError.Unauthorized(
      "Climate Advisor service authentication required",
    );
  }
}

export function requireRequestUser(
  session: AppSession | null,
  userId: string,
): void {
  if (!session?.user?.id || session.user.id !== userId) {
    throw new createHttpError.Forbidden(
      "Request user does not match authenticated service token",
    );
  }
}
