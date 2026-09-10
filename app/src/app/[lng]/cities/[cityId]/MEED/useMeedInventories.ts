"use client";
import { useMemo } from "react";
import { useGetInventoriesQuery } from "@/services/api";
import type { YearSelectorItem } from "@/components/shared/YearSelector";

/**
 * The city's inventories, shaped for the year selector.
 *
 * Lifted out of the overview page so the context header on every step can offer
 * the same switcher — the module is explicitly per-city *and* per-inventory, so
 * changing the inventory should not require navigating back to the overview.
 */
export function useMeedInventories(cityId: string | undefined) {
  const { data, isLoading } = useGetInventoriesQuery(
    { cityId: cityId! },
    { skip: !cityId },
  );

  const inventories: YearSelectorItem[] = useMemo(() => {
    if (!data) return [];
    return data
      .filter((inv) => inv.year && inv.inventoryId)
      .map((inv) => ({
        year: inv.year!,
        inventoryId: inv.inventoryId,
        lastUpdate: inv.lastUpdated || new Date(),
      }))
      .sort((a, b) => a.year - b.year);
  }, [data]);

  return { inventories, isLoading };
}
