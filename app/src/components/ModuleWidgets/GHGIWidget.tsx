import React from "react";
import { Box } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityPopulationQuery,
  useGetCityGHGIDashboardQuery,
} from "@/services/api";
import { useLatestInventory } from "@/hooks/use-latest-inventory";
import { useRouter } from "next/navigation";
import ReportResults from "../GHGI/ReportResults";
import { InventoryResponse } from "@/util/types";

interface GHGIWidgetProps {
  cityId: string;
  lng: string;
  onVisibilityChange?: (hasContent: boolean) => void;
  isPublic?: boolean;
}

export const GHGIWidget: React.FC<GHGIWidgetProps> = ({
  cityId,
  lng,
  onVisibilityChange,
  isPublic = false,
}) => {
  const { inventoryId, isLoading: isInventoryLoading } = useLatestInventory({
    cityId,
    isPublic,
  });

  // Fetch GHGI dashboard data
  const {
    data: ghgiData,
    isLoading: isGhgiLoading,
    error,
  } = useGetCityGHGIDashboardQuery(
    { cityId, inventoryId: inventoryId! },
    {
      skip: !inventoryId,
    },
  );

  const isLoading = isInventoryLoading || isGhgiLoading;
  const { data: population } = useGetCityPopulationQuery(
    { cityId: cityId, year: ghgiData?.year as number },
    { skip: !cityId || !ghgiData?.year },
  );

  const hasContent =
    ghgiData &&
    ghgiData.inventory &&
    ghgiData.totalEmissions?.total &&
    ghgiData.totalEmissions.total > 0;

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
    />
  );
};
