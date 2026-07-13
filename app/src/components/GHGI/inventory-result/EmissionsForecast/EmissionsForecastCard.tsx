import { EmissionsForecastData } from "@/util/types";
import { TFunction } from "i18next";
import { useState } from "react";
import { GrowthRatesExplanationModal } from "@/components/GHGI/inventory-result/EmissionsForecast/GrowthRatesExplanationModal";
import { Card, HStack, Icon } from "@chakra-ui/react";
import { EmissionsForecastChart } from "@/components/GHGI/inventory-result/EmissionsForecast/EmissionsForecastChart";
import { MdInfoOutline } from "react-icons/md";
import { TitleMedium } from "@/components/package/Texts/Title";

export const EmissionsForecastCard = ({
  forecast,
  t,
  lng,
  numberFormat,
}: {
  forecast: EmissionsForecastData;
  t: TFunction;
  lng: string;
  numberFormat?: string;
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

      <Card.Root paddingY="0px" paddingX="0px" minHeight="650px" width="100%">
        <Card.Header>
          <HStack>
            <TitleMedium>
              {t("no-action-emissions-forecast-by-sector")}
            </TitleMedium>
            {" | "}
            <TitleMedium
              onClick={() => setIsExplanationModalOpen(true)}
              cursor="pointer"
              _hover={{ textDecoration: "underline" }}
              color="content.link"
              fontWeight="normal"
            >
              {t("learn-more")}
              <Icon as={MdInfoOutline} boxSize={5} ml={2} />
            </TitleMedium>
          </HStack>
        </Card.Header>
        <Card.Body
          py={6}
          paddingLeft={4}
          paddingRight={0}
          minHeight="600px"
          w="full"
        >
          <EmissionsForecastChart
            forecast={forecast}
            t={t}
            numberFormat={numberFormat}
          />
        </Card.Body>
      </Card.Root>
    </>
  );
};
