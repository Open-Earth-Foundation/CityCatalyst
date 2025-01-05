import { EmissionsForecastData } from "@/util/types";
import { TFunction } from "i18next/typescript/t";
import { useState } from "react";
import { GrowthRatesExplanationModal } from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/GrowthRatesExplanationModal";
import {
  Card,
  CardBody,
  CardHeader,
  HStack,
  IconButton,
  Text,
} from "@chakra-ui/react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { EmissionsForecastChart } from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/EmissionsForecastChart";

export const EmissionsForecastCard = ({
  forecast,
  t,
  lng,
}: {
  forecast: EmissionsForecastData;
  t: TFunction;
  lng: string;
}) => {
  const [isExplanationModalOpen, setIsExplanationModalOpen] = useState(false);

  return (
    <>
      <GrowthRatesExplanationModal
        t={t}
        isOpen={isExplanationModalOpen}
        onClose={() => setIsExplanationModalOpen(false)}
        emissionsForecast={forecast}
        lng={lng}
      />

      <Card paddingY="0px" paddingX="0px" height="100%" width="100%">
        <CardHeader>
          <HStack justifyContent="space-between">
            <Text fontFamily="heading" fontSize="title.md" fontWeight="medium">
              {t("breakdown-of-sub-sector-emissions")}
            </Text>
            <IconButton
              width={"20px"}
              height={"20px"}
              variant={"unstyled"}
              isRound
              onClick={() => setIsExplanationModalOpen(true)}
              icon={<InfoOutlineIcon marginRight={3} fontSize={"20px"} />}
              aria-label={"growth-rates-explanation"}
            />
          </HStack>
        </CardHeader>
        <CardBody
          paddingY="0px"
          paddingLeft={4}
          paddingRight={0}
          height="100%"
          width="100%"
        >
          <EmissionsForecastChart forecast={forecast} t={t} />
        </CardBody>
      </Card>
    </>
  );
};
