import { useGetInventoriesQuery, api } from "@/services/api";

interface UseLatestInventoryProps {
  cityId: string;
  isPublic?: boolean;
}

export const useLatestInventory = ({ cityId, isPublic = false }: UseLatestInventoryProps) => {
  // Fetch latest inventory for the city
  const { data: privateInventories, isLoading: isPrivateInventoriesLoading } =
    useGetInventoriesQuery(
      { cityId: cityId! },
      { skip: !cityId || isPublic },
    );

  const { data: publicInventories, isLoading: isPublicInventoriesLoading } =
    api.useGetPublicCityInventoriesQuery(cityId!, {
      skip: !cityId || !isPublic,
    });

  // Use the appropriate data based on mode
  const inventories = isPublic ? publicInventories : privateInventories;
  const isInventoriesLoading = isPublic
    ? isPublicInventoriesLoading
    : isPrivateInventoriesLoading;

  const latestInventory = inventories?.[0];
  const inventoryId = latestInventory?.inventoryId;

  return {
    inventoryId,
    latestInventory,
    isLoading: isInventoriesLoading,
  };
};