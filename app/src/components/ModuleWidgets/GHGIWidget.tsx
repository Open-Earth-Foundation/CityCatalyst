import React from "react";
import { Text, HStack, Box, Heading } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n/client";
import EmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsWidget";
import TopEmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/TopEmissionsWidget";
import { Trans } from "react-i18next";
import {
  useGetCityPopulationQuery,
  useGetCityGHGIDashboardQuery,
} from "@/services/api";
import { MdOpenInNew } from "react-icons/md";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

interface GHGIWidgetProps {
  cityId: string;
  lng: string;
  inventoryId: string;
  onVisibilityChange?: (hasContent: boolean) => void;
  isPublic?: boolean;
}

export const GHGIWidget: React.FC<GHGIWidgetProps> = ({
  cityId,
  lng,
  inventoryId,
  onVisibilityChange,
  isPublic = false,
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const router = useRouter();

  // Fetch GHGI dashboard data
  const {
    data: ghgiData,
    isLoading,
    error,
  } = useGetCityGHGIDashboardQuery({ cityId, inventoryId });
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
    <Box w="full">
      <HStack justifyContent="space-between" mb={2}>
        <Text color="content.link">{t("inventories")}</Text>
        {!isPublic && (
          <Button
            onClick={() => {
              router.push(`/cities/${cityId}/GHGI`);
            }}
            variant="outline"
            borderColor="border.neutral"
            color="content.primary"
          >
            <Text>{t("open-cc-inventories")}</Text>
            <MdOpenInNew />
          </Button>
        )}
      </HStack>
      <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
        <Trans
          i18nKey="sector-emissions-in"
          values={{ year: ghgiData?.year || "N/A" }}
          t={t}
        ></Trans>
      </Heading>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
      >
        {t("see-your-citys-emissions")}
      </Text>
      <HStack alignItems="start" mt={12} gap={4}>
        <EmissionsWidget
          t={t}
          inventory={{
            ...ghgiData.inventory,
            totalEmissions: Number(ghgiData.totalEmissions.total) || 0,
          }}
          population={population}
        />
        <TopEmissionsWidget
          t={t}
          inventory={ghgiData.inventory}
          isPublic={ghgiData.inventory.isPublic || false}
        />
      </HStack>
    </Box>
  );
};
