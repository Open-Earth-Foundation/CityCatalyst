import React from "react";
import { Card, Text, HStack, Box, Heading, Link } from "@chakra-ui/react";
import { DashboardWidgetProps } from "./types";
import { useTranslation } from "@/i18n/client";
import EmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsWidget";
import TopEmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/TopEmissionsWidget";
import { BlueSubtitle } from "../Texts/BlueSubtitle";
import { Trans } from "react-i18next";
import { useGetCityPopulationQuery } from "@/services/api";
import { da } from "date-fns/locale";
import { MdOpenInNew } from "react-icons/md";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

export const GHGIWidget: React.FC<DashboardWidgetProps> = ({
  moduleId,
  cityId,
  data,
  error,
}) => {
  const { t } = useTranslation("en", "dashboard");
  const router = useRouter();

  const { data: population } = useGetCityPopulationQuery(
    { cityId: cityId as string, year: data?.year as number },
    { skip: !cityId || !data?.year },
  );

  return (
    <Box w="full">
      <HStack justifyContent="space-between" mb={2}>
        <Text color="content.link">{t("inventories")}</Text>
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
      </HStack>
      <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
        <Trans
          i18nKey="sector-emissions-in"
          values={{ year: data?.year || "N/A" }}
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
      {data?.inventory ? (
        <HStack alignItems="start" mt={12} gap={4}>
          <EmissionsWidget
            t={t}
            inventory={{
              ...data?.inventory,
              totalEmissions: Number(data?.totalEmissions.total) || 0,
            }}
            population={population}
          />
          <TopEmissionsWidget
            t={t}
            inventory={data?.inventory}
            isPublic={data?.inventory.isPublic || false}
          />
        </HStack>
      ) : null}
    </Box>
  );
};
