import { Box, Heading, Text } from "@chakra-ui/react";
import { api } from "@/services/api";
import { BlueSubtitle } from "@/components/Texts/BlueSubtitle";
import type { TFunction } from "i18next";
import { EmissionsForecastCard } from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/EmissionsForecastCard";

export const EmissionsForecastSection = ({
  inventoryId,
  t,
  lng,
}: {
  inventoryId: string;
  t: TFunction;
  lng: string;
}) => {
  const { data: forecast, isLoading: isForecastLoading } =
    api.useGetEmissionsForecastQuery(inventoryId);

  if (!forecast?.forecast || isForecastLoading) {
    return <div></div>;
  }
  return (
    <Box>
      <BlueSubtitle t={t} text={"projections-data"} />
      <Heading
        fontSize="title.lg"
        fontWeight="semibold"
        lineHeight="24"
        pb="8px"
      >
        {t("sector-emissions-forecast")}
      </Heading>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
        mb="24px"
      >
        {t("sector-emissions-forecast-description")}
      </Text>
      <Box height="auto" width="100%">
        <EmissionsForecastCard t={t} forecast={forecast} lng={lng} />
      </Box>
    </Box>
  );
};
