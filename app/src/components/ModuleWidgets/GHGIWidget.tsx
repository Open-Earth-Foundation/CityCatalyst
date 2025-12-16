import React from "react";
import { Box } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetCityPopulationQuery,
  useGetCityGHGIDashboardQuery,
} from "@/services/api";
import { useLatestInventory } from "@/hooks/use-latest-inventory";
import ReportResults from "../GHGI/ReportResults";
import { InventoryResponse, GHGInventorySummary } from "@/util/types";
import type {
  InventoryAttributes,
  PopulationAttributes,
} from "@/models/init-models";

interface GHGIWidgetProps {
  cityId: string;
  lng: string;
  onVisibilityChange?: (hasContent: boolean) => void;
  isPublic?: boolean;
  year?: number;
  ghgiData?: GHGInventorySummary | null;
  inventories?: InventoryAttributes[];
  population?: PopulationAttributes | null;
}

export const GHGIWidget: React.FC<GHGIWidgetProps> = ({
  cityId,
  lng,
  onVisibilityChange,
  isPublic = false,
  year,
  ghgiData: preFetchedGhgiData,
  inventories: preFetchedInventories,
  population: preFetchedPopulation,
}) => {
  // Use pre-fetched inventories if available, otherwise fetch
  const { inventoryId, isLoading: isInventoryLoading } = useLatestInventory({
    cityId,
    isPublic,
    year,
    preFetchedInventories, // Pass pre-fetched inventories to skip API calls
  });

  // Use inventoryId from hook (it will use pre-fetched data if available)
  const finalInventoryId = inventoryId;

  // Fetch GHGI dashboard data only if not provided (fallback for direct widget access)
  const {
    data: fetchedGhgiData,
    isLoading: isGhgiLoading,
    error,
  } = useGetCityGHGIDashboardQuery(
    { cityId, inventoryId: finalInventoryId! },
    {
      skip: !finalInventoryId || !!preFetchedGhgiData, // Skip if pre-fetched data is available
    },
  );

  // Use pre-fetched data if available, otherwise use fetched data
  const ghgiData = preFetchedGhgiData || fetchedGhgiData;

  // Use pre-fetched population if available, otherwise fetch
  const { data: fetchedPopulation } = useGetCityPopulationQuery(
    { cityId: cityId, year: ghgiData?.year as number },
    {
      skip: !cityId || !ghgiData?.year || !!preFetchedPopulation, // Skip if pre-fetched population available
    },
  );

  const population = preFetchedPopulation || fetchedPopulation;
  const isLoading = isInventoryLoading || isGhgiLoading;

  const hasContent =
    ghgiData &&
    ghgiData.inventory &&
    ghgiData.totalEmissions &&
    ghgiData.totalEmissions.total !== null &&
    ghgiData.totalEmissions.total !== undefined &&
    ghgiData.totalEmissions.bySector &&
    Array.isArray(ghgiData.totalEmissions.bySector) &&
    ghgiData.totalEmissions.bySector.length > 0;

  React.useEffect(() => {
    if (!isLoading) {
      onVisibilityChange?.(!!hasContent);
    }
  }, [hasContent, isLoading, onVisibilityChange]);

  if (isLoading) {
    return (
      <Box w="full" p="24px">
        <Skeleton height="200px" borderRadius="8px" />
      </Box>
    );
  }

  if (error || !hasContent) {
    return null;
  }

  return (
    <ReportResults
      lng={lng}
      inventory={ghgiData?.inventory as InventoryResponse}
      isPublic={isPublic}
      population={population}
      context="dashboard"
    />
  );
};
