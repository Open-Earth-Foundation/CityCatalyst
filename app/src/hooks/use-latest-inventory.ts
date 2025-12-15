import { useGetInventoriesQuery, api } from "@/services/api";
import type { InventoryAttributes } from "@/models/init-models";

interface UseLatestInventoryProps {
  cityId: string;
  isPublic?: boolean;
  year?: number;
  preFetchedInventories?: InventoryAttributes[];
}

export const useLatestInventory = ({
  cityId,
  isPublic = false,
  year,
  preFetchedInventories,
}: UseLatestInventoryProps) => {
  // Skip API calls if pre-fetched inventories are provided
  const shouldSkipFetch = !!preFetchedInventories;

  // Fetch latest inventory for the city (only if not pre-fetched)
  const { data: privateInventories, isLoading: isPrivateInventoriesLoading } =
    useGetInventoriesQuery(
      { cityId: cityId! },
      { skip: !cityId || isPublic || shouldSkipFetch },
    );

  const { data: publicInventories, isLoading: isPublicInventoriesLoading } =
    api.useGetPublicCityInventoriesQuery(cityId!, {
      skip: !cityId || !isPublic || shouldSkipFetch,
    });

  // Use pre-fetched inventories if available, otherwise use fetched data
  const inventories =
    preFetchedInventories ||
    (isPublic ? publicInventories : privateInventories);
  const isInventoriesLoading = shouldSkipFetch
    ? false
    : isPublic
      ? isPublicInventoriesLoading
      : isPrivateInventoriesLoading;

  // Filter by year if provided, otherwise use latest (first in array)
  const latestInventory = year
    ? inventories?.find(
        (inventory) => inventory.year === parseInt(year.toString()),
      )
    : inventories?.[0];
  const inventoryId = latestInventory?.inventoryId;

  return {
    inventoryId,
    latestInventory,
    isLoading: isInventoriesLoading,
  };
};
