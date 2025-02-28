import { chakra, HStack, Icon, Link, Stack, VStack } from "@chakra-ui/react";
import { MdOpenInNew } from "react-icons/md";
import { getTranslationFromDict } from "@/i18n";
import { TitleLarge } from "@/components/Texts/Title";
import { BodyLarge } from "@/components/Texts/Body";
import { HeadlineLarge } from "@/components/Texts/Headline";
import LabelLarge from "@/components/Texts/Label";
import { api } from "@/services/api";
import { DataSourceWithRelations } from "@/app/[lng]/[inventory]/data/[step]/types";
import { TFunction } from "i18next";

interface ScalingSectionProps {
  source: DataSourceWithRelations;
  t: TFunction;
  inventoryId?: string;
}

const ScalingSection = ({ source, t, inventoryId }: ScalingSectionProps) => {
  const { data: populations } = api.useGetInventoryPopulationsQuery(
    inventoryId!,
    {
      skip: !inventoryId,
    },
  );
  const isDownscaled =
    source.retrievalMethod == "global_api_downscaled_by_population";
  const isCountryResolution = source.spatialResolution === "country";
  const areaPopulation = isCountryResolution
    ? populations?.countryPopulation
    : populations?.regionPopulation;
  const areaPopulationYear = isCountryResolution
    ? populations?.countryPopulationYear
    : populations?.regionPopulationYear;
  if (isDownscaled && populations?.population) {
    return (
      <Stack>
        <VStack align="flex-start">
          <HStack align="flex-start">
            <TitleLarge>{t("how-data-was-scaled")}</TitleLarge>
          </HStack>
          <BodyLarge>{t("about-data-availability-description")}</BodyLarge>
        </VStack>
        {areaPopulation && (
          <HStack
            width={"70%"}
            justifyContent="center"
            alignItems="center"
            margin="24px auto"
          >
            <VStack>
              <HeadlineLarge>{populations.population}</HeadlineLarge>
              <LabelLarge paddingTop={4}>{t("city-population")}</LabelLarge>
              <LabelLarge>{populations.year}</LabelLarge>
            </VStack>
            <VStack>
              <BodyLarge fontSize={40}>/</BodyLarge>
              <LabelLarge paddingTop={4}></LabelLarge>
            </VStack>
            <VStack>
              <HeadlineLarge>{areaPopulation}</HeadlineLarge>
              <LabelLarge paddingTop={4}>
                {isCountryResolution
                  ? t("country-population")
                  : t("region-population")}
              </LabelLarge>
              <LabelLarge>{areaPopulationYear}</LabelLarge>
            </VStack>
            <VStack>
              <BodyLarge fontSize={40}>=</BodyLarge>
              <LabelLarge paddingTop={4}></LabelLarge>
            </VStack>
            <VStack>
              <HeadlineLarge>
                {populations.population / areaPopulation}
              </HeadlineLarge>
              <LabelLarge paddingTop={4}>{t("scaling-factor")}</LabelLarge>
            </VStack>
          </HStack>
        )}
        <chakra.hr borderColor="border.neutral" />
        <TitleLarge>
          {t("methodology")}
          <Link
            href={source.methodologyUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Icon as={MdOpenInNew} color="content.link" ml={2} />
          </Link>
        </TitleLarge>
        <BodyLarge>
          {getTranslationFromDict(source.methodologyDescription)}
        </BodyLarge>
        <TitleLarge verticalAlign="baseline">
          {t("transform-data-heading")}
          <Link
            href="https://citycatalyst.openearth.org"
            target="_blank"
            rel="noreferrer noopener"
          >
            <Icon as={MdOpenInNew} color="content.link" ml={2} />
          </Link>
        </TitleLarge>
        <BodyLarge>
          {getTranslationFromDict(source.transformationDescription)}
        </BodyLarge>
      </Stack>
    );
  }
  return null;
};

export default ScalingSection;
