import { useGetInventoriesQuery, api } from "@/services/api";

interface UseLatestInventoryProps {
  cityId: string;
  isPublic?: boolean;
  year?: number;
}

export const useLatestInventory = ({
  cityId,
  isPublic = false,
  year,
}: UseLatestInventoryProps) => {
  // Fetch latest inventory for the city
  const { data: privateInventories, isLoading: isPrivateInventoriesLoading } =
    useGetInventoriesQuery({ cityId: cityId! }, { skip: !cityId || isPublic });

  const { data: publicInventories, isLoading: isPublicInventoriesLoading } =
    api.useGetPublicCityInventoriesQuery(cityId!, {
      skip: !cityId || !isPublic,
    });

  console.log("useLatestInventory fetch:", publicInventories);

  // Use the appropriate data based on mode
  const inventories = isPublic ? publicInventories : privateInventories;
  const isInventoriesLoading = isPublic
    ? isPublicInventoriesLoading
    : isPrivateInventoriesLoading;

  // Filter by year if provided, otherwise use latest (first in array)
  const latestInventory = year
    ? inventories?.find(
        (inventory) => inventory.year === parseInt(year.toString()),
      )
    : inventories?.[0];
  const inventoryId = latestInventory?.inventoryId;

  // Debug logging
  console.log("useLatestInventory debug:", {
    cityId,
    year,
    inventories: inventories?.length,
    inventoryId,
    latestInventory,
  });

  return {
    inventoryId,
    latestInventory,
    isLoading: isInventoriesLoading,
  };
};
