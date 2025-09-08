import React from "react";
import { Text, HStack, Box, Heading } from "@chakra-ui/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/i18n/client";
import { useGetCityCCRADashboardQuery } from "@/services/api";
import { MdOpenInNew } from "react-icons/md";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import TopRisksWidget from "./CCRAWidget";
import { HeadlineLarge, HeadlineSmall } from "../Texts/Headline";
import { BodyLarge } from "../Texts/Body";

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
  const { t } = useTranslation(lng, "ccra");
  const router = useRouter();

  // Fetch CCRA dashboard data
  const {
    data: ccraData,
    isLoading,
    error,
  } = useGetCityCCRADashboardQuery({ cityId, inventoryId });

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
      <HStack justifyContent="space-between" mb={2}>
        <Text color="content.link">{t("climate-risk-assessment")}</Text>
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
