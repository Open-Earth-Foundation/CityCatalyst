import React from "react";
import { Text, HStack, Box, Heading, Icon, Link } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n/client";
import { useGetCityCCRADashboardQuery, useGetCityQuery } from "@/services/api";
import { useLatestInventory } from "@/hooks/use-latest-inventory";
import { MdOpenInNew } from "react-icons/md";
import { Button } from "../ui/button";
import TopRisksWidget from "./CCRAWidget";
import {
  HeadlineLarge,
  HeadlineSmall,
} from "@/components/package/Texts/Headline";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";

interface CCRAWidgetProps {
  cityId: string;
  lng: string;
  onVisibilityChange?: (hasContent: boolean) => void;
  isPublic?: boolean;
  year?: number;
}

const CCRA_REPLIT_URL =
  process.env.NEXT_PUBLIC_CC_CCRA_REPLIT_URL ??
  "https://citycatalyst-ccra.replit.app";

export const CCRAWidget: React.FC<CCRAWidgetProps> = ({
  cityId,
  lng,
  isPublic = false,
  onVisibilityChange,
  year,
}) => {
  const { t } = useTranslation(lng, "ccra");

  const { inventoryId, isLoading: isInventoryLoading } = useLatestInventory({
    cityId,
    isPublic,
    year,
  });

  // Fetch CCRA dashboard data
  const {
    data: ccraData,
    isLoading: isCcraLoading,
    error,
  } = useGetCityCCRADashboardQuery(
    { cityId, inventoryId: inventoryId! },
    {
      skip: !inventoryId,
    },
  );

  // Get city by cityId
  const { data: city } = useGetCityQuery(cityId, {
    skip: !cityId,
  });

  const isLoading = isInventoryLoading || isCcraLoading;

  const hasContent =
    ccraData && ccraData.topRisks && ccraData.topRisks.length > 0;

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
      <HStack justifyContent="space-between" mt={2}>
        <Text color="content.link">{t("climate-risk-assessment")}</Text>

        {city?.locode && city.locode.trim() !== "" && (
          <Link
            href={`${CCRA_REPLIT_URL}/cities/${encodeURIComponent(city.locode)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              borderColor="border.neutral"
              color="content.primary"
              p="24px"
            >
              <BodyMedium
                fontWeight="bold"
                color="content.primary"
                fontFamily="heading"
              >
                {t("see-full-risk-results")}
              </BodyMedium>
              <Icon as={MdOpenInNew} color="interactive.control" />
            </Button>
          </Link>
        )}
      </HStack>
      <HeadlineSmall fontWeight="semibold">
        {t("top-climate-risks")}
      </HeadlineSmall>
      <BodyLarge fontWeight="regular" color="interactive.control">
        {t("top-climate-risks-description")}
      </BodyLarge>
      <Box mt={10}>
        <TopRisksWidget
          cityId={cityId}
          cityName={""}
          riskAssessment={ccraData.topRisks}
          lng={lng}
        />
      </Box>
    </Box>
  );
};
