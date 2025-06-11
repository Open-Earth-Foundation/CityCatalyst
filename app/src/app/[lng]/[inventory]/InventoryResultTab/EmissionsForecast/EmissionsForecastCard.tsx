import { EmissionsForecastData } from "@/util/types";
import { TFunction } from "i18next";
import { useState } from "react";
import { GrowthRatesExplanationModal } from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/GrowthRatesExplanationModal";
import {
  Card,
  CardBody,
  CardHeader,
  HStack,
  Icon,
  IconButton,
} from "@chakra-ui/react";
import { EmissionsForecastChart } from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/EmissionsForecastChart";
import { MdInfoOutline } from "react-icons/md";
import { TitleMedium } from "@/components/Texts/Title";

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

      <Card.Root paddingY="0px" paddingX="0px" height="100%" width="100%">
        <CardHeader>
          <HStack>
            <TitleMedium>{t("breakdown-of-sub-sector-emissions")}</TitleMedium>
            {" | "}
            <HStack
              onClick={() => setIsExplanationModalOpen(true)}
              cursor="pointer"
            >
              <TitleMedium color="content.link">{t("learn-more")}</TitleMedium>
              <IconButton
                padding={0}
                width={"20px"}
                height={"20px"}
                variant="plain"
                rounded="full"
                aria-label={"growth-rates-explanation"}
              >
                <Icon as={MdInfoOutline} boxSize={5} />
              </IconButton>
            </HStack>
          </HStack>
        </CardHeader>
        <CardBody
          paddingY="0px"
          paddingLeft={4}
          paddingRight={0}
          height="auto"
          width="100%"
        >
          <EmissionsForecastChart forecast={forecast} t={t} />
        </CardBody>
      </Card.Root>
    </>
  );
};
