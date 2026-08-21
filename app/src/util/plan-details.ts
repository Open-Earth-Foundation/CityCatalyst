import { addDays, differenceInCalendarDays } from "date-fns";

import { OrganizationPlanType } from "@/util/enums";
import { OrganizationResponse } from "@/util/types";

export const TRIAL_PLAN_DURATION_DAYS = 30;

export interface OrganizationProjectStats {
  numCities: number;
  totalCityLimit: bigint;
  citySlotsRemaining: number;
}

export interface OrganizationPlanDisplay extends OrganizationProjectStats {
  planType: OrganizationPlanType;
  projectCount: number;
  trialDaysRemaining: number | null;
}

export function calculateOrganizationProjectStats(
  projects: OrganizationResponse["projects"] = [],
): OrganizationProjectStats {
  const totals = projects.reduce(
    (acc, project) => ({
      numCities: acc.numCities + project.cities.length,
      totalCityLimit: acc.totalCityLimit + BigInt(project.cityCountLimit),
    }),
    { numCities: 0, totalCityLimit: 0n },
  );

  return {
    ...totals,
    citySlotsRemaining: Math.max(
      0,
      Number(totals.totalCityLimit - BigInt(totals.numCities)),
    ),
  };
}

export function getTrialDaysRemaining(
  trialEndsAt?: string | Date | null,
): number | null {
  if (!trialEndsAt) {
    return null;
  }

  const endDate =
    typeof trialEndsAt === "string" ? new Date(trialEndsAt) : trialEndsAt;

  return Math.max(0, differenceInCalendarDays(endDate, new Date()));
}

export function getOrganizationPlanDisplay(
  organization: OrganizationResponse,
): OrganizationPlanDisplay {
  const stats = calculateOrganizationProjectStats(organization.projects ?? []);

  return {
    planType: organization.planType ?? OrganizationPlanType.FULL,
    projectCount: organization.projects?.length ?? 0,
    trialDaysRemaining:
      organization.planType === OrganizationPlanType.TRIAL
        ? getTrialDaysRemaining(organization.trialEndsAt)
        : null,
    ...stats,
  };
}

/** Resolve trial end date when creating or updating an organization plan. */
export function resolveOrganizationTrialEndsAt({
  planType,
  existingTrialEndsAt,
  requestedTrialEndsAt,
}: {
  planType: OrganizationPlanType;
  existingTrialEndsAt?: Date | null;
  requestedTrialEndsAt?: Date | null;
}): Date | null {
  if (planType !== OrganizationPlanType.TRIAL) {
    return null;
  }

  if (requestedTrialEndsAt) {
    return requestedTrialEndsAt;
  }

  if (existingTrialEndsAt) {
    return existingTrialEndsAt;
  }

  return addDays(new Date(), TRIAL_PLAN_DURATION_DAYS);
}

export function resolveOrganizationPlanType(
  planType?: OrganizationPlanType,
): OrganizationPlanType {
  return planType ?? OrganizationPlanType.FULL;
}
