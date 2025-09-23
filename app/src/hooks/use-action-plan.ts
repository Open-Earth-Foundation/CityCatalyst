import {
  useGetActionPlansQuery,
  useGetActionPlanByIdQuery,
} from "@/services/api";
import { HIAction } from "@/util/types";

interface ActionPlan {
  id: string;
  actionId: string;
  inventoryId: string;
  hiActionRankingId?: string;
  cityLocode: string;
  actionName: string;
  language: string;
  planData: any;
  createdBy?: string;
  created: string;
  lastUpdated: string;
}

interface UseActionPlanProps {
  actionId: string;
  inventoryId: string;
  language: string;
}

/**
 * Hook to check if an action plan exists for a specific action
 */
export const useActionPlan = ({
  actionId,
  inventoryId,
  language,
}: UseActionPlanProps) => {
  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useGetActionPlansQuery(
    { inventoryId, language, actionId },
    {
      skip: !actionId || !inventoryId || !language || inventoryId === "",
    },
  );

  // Extract the first action plan from the response and transform to legacy format
  const actionPlan = response?.actionPlans?.[0] || null;
  const data = actionPlan
    ? {
        ...actionPlan,
        planData: {
          metadata: {
            cityName: actionPlan.cityName,
            createdAt: actionPlan.createdAtTimestamp,
            locode: actionPlan.cityLocode,
            actionId: actionPlan.actionId,
            actionName: actionPlan.actionName,
            language: actionPlan.language,
          },
          content: {
            introduction: {
              city_description: actionPlan.cityDescription,
              action_description: actionPlan.actionDescription,
              national_strategy_explanation:
                actionPlan.nationalStrategyExplanation,
            },
            subactions: actionPlan.subactions,
            institutions: actionPlan.institutions,
            milestones: actionPlan.milestones,
            timeline: actionPlan.timeline,
            costBudget: actionPlan.costBudget,
            merIndicators: actionPlan.merIndicators,
            mitigations: actionPlan.mitigations,
            adaptations: actionPlan.adaptations,
            sdgs: actionPlan.sdgs,
          },
        },
      }
    : null;

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Hook to fetch a specific action plan by ID
 */
export const useActionPlanById = (planId: string | null) => {
  const { data, isLoading, error, refetch } = useGetActionPlanByIdQuery(
    planId!,
    { skip: !planId || planId === "" },
  );

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};

export type { ActionPlan };
