import { useState, useEffect } from "react";
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
  const [data, setData] = useState<ActionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActionPlan = async () => {
    if (!actionId || !inventoryId || !language) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v0/action-plans?inventoryId=${inventoryId}&language=${language}&actionId=${actionId}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          setData(null); // No plan exists
          return;
        }
        throw new Error(`Failed to fetch action plan: ${response.statusText}`);
      }

      const result = await response.json();
      // Return the first matching plan if any exist
      setData(result.actionPlans?.[0] || null);
    } catch (err) {
      console.error("Error fetching action plan:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActionPlan();
  }, [actionId, inventoryId, language]);

  const refetch = () => {
    fetchActionPlan();
  };

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
  const [data, setData] = useState<ActionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActionPlanById = async () => {
    if (!planId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v0/action-plans/${planId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch action plan: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Error fetching action plan:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActionPlanById();
  }, [planId]);

  const refetch = () => {
    fetchActionPlanById();
  };

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};

export type { ActionPlan };
