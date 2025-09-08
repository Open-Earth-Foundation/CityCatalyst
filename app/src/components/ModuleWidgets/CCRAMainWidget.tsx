import React from "react";
import { Text, HStack, Box, Heading } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n/client";
import { useGetCityCCRADashboardQuery } from "@/services/api";
import { MdOpenInNew } from "react-icons/md";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import TopRisksWidget from "./CCRAWidget";

interface CCRAWidgetProps {
  cityId: string;
  inventoryId: string;
  lng: string;
  onVisibilityChange?: (hasContent: boolean) => void;
}

export const CCRAWidget: React.FC<CCRAWidgetProps> = ({
  cityId,
  inventoryId,
  lng,
  onVisibilityChange,
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const router = useRouter();

  // Fetch CCRA dashboard data
  const {
    data: ccraData,
    isLoading,
    error,
  } = useGetCityCCRADashboardQuery({ cityId, inventoryId });

  const hasContent =
    ccraData &&
    ccraData.riskAssessment &&
    ccraData.riskAssessment.length > 0;

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
        <Text color="content.link">{t("climate-risk-assessment")}</Text>
        <Button
          onClick={() => {
            router.push(`/cities/${cityId}/CCRA`);
          }}
          variant="outline"
          borderColor="border.neutral"
          color="content.primary"
        >
          <Text>{t("open-ccra")}</Text>
          <MdOpenInNew />
        </Button>
      </HStack>
      <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
        {t("climate-risks-for-city")}
      </Heading>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
      >
        {t("see-your-citys-climate-risks")}
      </Text>
      <Box mt={6}>
        <TopRisksWidget
          cityId={cityId}
          cityName={ccraData.cityName}
          riskAssessment={ccraData.riskAssessment}
          resilienceScore={ccraData.resilienceScore}
        />
      </Box>
    </Box>
  );
};