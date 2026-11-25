"use client";
import { useEffect } from "react";
import type { TFunction } from "i18next";
import { api } from "@/services/api";
import { setMeedStepState } from "./meedLocalState";
import { emissionsRetrievedState } from "./meedEmissions";

/**
 * Reads the inventory's emissions results and records the emissions step from
 * them. Emissions are not something the city enters or fetches in MEED:
 * CityCatalyst already holds the inventory, so every screen that needs the
 * data reads it through here and the step state follows the data on its own.
 * The home screen and the breakdown page both use this, so they can never
 * disagree about what "loaded" means.
 */
export function useMeedEmissions(
  inventoryId: string | undefined,
  t: TFunction,
) {
  const query = api.useGetResultsQuery(inventoryId!, { skip: !inventoryId });
  const { data: results, isLoading, isError } = query;

  useEffect(() => {
    if (!inventoryId || isLoading || isError || !results) return;
    setMeedStepState(
      inventoryId,
      "emissions",
      emissionsRetrievedState(results, t),
    );
  }, [inventoryId, isLoading, isError, results, t]);

  return query;
}
