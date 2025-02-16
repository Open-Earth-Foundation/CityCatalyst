import type { SectorAttributes } from "@/models/Sector";
import {
  chakra,
  Heading,
  HStack,
  Icon,
  Link,
  Separator,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { RefObject } from "react";
import {
  MdArrowBack,
  MdHomeWork,
  MdInfoOutline,
  MdOpenInNew,
} from "react-icons/md";
import type { DataSourceData, DataSourceWithRelations } from "./types";
import { getTranslationFromDict } from "@/i18n";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerRoot,
} from "@/components/ui/drawer";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import SourceDrawerTags from "./SourceDrawerTags";
import { TitleLarge, TitleMedium } from "@/components/Texts/Title";
import { SourceDrawerActivityTable } from "./SourceDrawerActivityTable";
import { BodyLarge } from "@/components/Texts/Body";
import { api } from "@/services/api";
import { HeadlineLarge } from "@/components/Texts/Headline";
import LabelLarge from "@/components/Texts/Label";
import { DisplayMedium } from "@/components/Texts/Display";

export function SourceDrawer({
  source,
  sourceData,
  sector,
  isOpen,
  onClose,
  onConnectClick,
  finalFocusRef,
  isConnectLoading,
  t,
  hideActions,
  totalEmissionsData,
  inventoryId,
}: {
  hideActions?: boolean;
  source?: DataSourceWithRelations;
  sourceData?: DataSourceData | null;
  sector?: SectorAttributes;
  isOpen: boolean;
  onClose: () => void;
  onConnectClick: () => void;
  finalFocusRef?: RefObject<any>;
  isConnectLoading: boolean;
  totalEmissionsData?: string;
  t: TFunction;
  inventoryId: string;
}) {
  const { data: populations } = api.useGetInventoryPopulationsQuery(
    inventoryId,
    {
      skip: !inventoryId,
    },
  );

  const emissionsToBeIncluded = () => {
    let number, unit;
    let converted;
    if (!!totalEmissionsData && totalEmissionsData !== "?") {
      converted = convertKgToTonnes(parseFloat(totalEmissionsData));
    }
    const emissionsData = sourceData?.totals?.emissions?.co2eq_100yr;
    let totalEmissions = emissionsData
      ? ((Number(emissionsData) * sourceData?.scaleFactor) / 1000).toFixed(2)
      : "?";
    if (sourceData?.issue) {
      totalEmissions = "?";
    }
    if (!!totalEmissions && totalEmissions !== "?") {
      converted = convertKgToTonnes(parseInt(totalEmissions));
    }
    if (!converted) {
      return { number: totalEmissionsData ?? totalEmissions, unit: "" };
    }
    return {
      number: converted.split(" ")[0],
      unit: converted.split(" ").slice(1).join(" "),
    };
  };

  return (
    <DrawerRoot
      open={isOpen}
      placement="end"
      onExitComplete={onClose}
      size="xl"
    >
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerBody>
          <Stack h="full" px={[4, 4, 16]} pt={12}>
            <Button
              variant="ghost"
              color="content.link"
              alignSelf="flex-start"
              onClick={onClose}
              px={6}
              py={4}
              mb={6}
            >
              <Icon as={MdArrowBack} boxSize={4} />
              {t("go-back")}
            </Button>
            {source && (
              <DrawerBody className="space-y-6 overflow-auto" px={0}>
                <Icon as={MdHomeWork} boxSize={9} />
                <Heading
                  color="content.tertiary"
                  textTransform="uppercase"
                  letterSpacing="1.25px"
                  fontSize="title.sm"
                  lineHeight="16px"
                >
                  {t(toKebabCase(sector?.sectorName))} /{" "}
                  {t(
                    toKebabCase(source.subSector?.subsectorName) ||
                      toKebabCase(source.subCategory?.subsector?.subsectorName),
                  )}
                </Heading>
                <Heading fontSize="title.lg">
                  {source.subCategory?.referenceNumber ||
                    source.subSector?.referenceNumber}{" "}
                  {t(
                    toKebabCase(source.subCategory?.subcategoryName) ||
                      toKebabCase(source.subSector?.subsectorName),
                  )}
                </Heading>
                <Heading
                  fontSize="32px"
                  lineHeight="40px"
                  textTransform="capitalize"
                >
                  {getTranslationFromDict(source.datasetName)}
                </Heading>
                <HStack>
                  <TitleMedium>{t("by")} </TitleMedium>
                  <Link
                    href={source.publisher?.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <TitleMedium color="content.link">
                      {source.publisher?.name}
                    </TitleMedium>
                  </Link>
                </HStack>
                <TitleMedium>
                  {t("total-emissions-included")}{" "}
                  <Tooltip
                    showArrow
                    content={
                      t("total-emissions-tooltip") +
                      ".\nScale factor: " +
                      sourceData?.scaleFactor.toFixed(4)
                    }
                    positioning={{ placement: "bottom-end" }}
                  >
                    <Icon
                      as={MdInfoOutline}
                      color="interactive.control"
                      boxSize={4}
                    />
                  </Tooltip>
                </TitleMedium>

                <HStack align="baseline">
                  <DisplayMedium color={"content.link"}>
                    {emissionsToBeIncluded().number}
                  </DisplayMedium>
                  <Text
                    color="content.tertiary"
                    fontSize="22px"
                    lineHeight="28px"
                    fontFamily="heading"
                    fontWeight={600}
                  >
                    {emissionsToBeIncluded().unit}
                  </Text>
                </HStack>

                {sourceData?.issue && (
                  <Text color="semantic.danger" fontSize="body.sm" mt={-4}>
                    {t("error")}: {t(sourceData?.issue)}
                  </Text>
                )}

                <SourceDrawerTags t={t} source={source} />
                <Separator />
                <Stack className="space-y-4">
                  <TitleLarge>{t("inside-dataset")}</TitleLarge>
                  <BodyLarge color="content.tertiary">
                    {getTranslationFromDict(source.datasetDescription)}
                  </BodyLarge>
                  <TitleMedium>{t("disaggregated-analysis")}</TitleMedium>
                  {sourceData?.records && (
                    <SourceDrawerActivityTable
                      sectorId={sector?.sectorId}
                      activities={sourceData.records}
                      t={t}
                    />
                  )}
                  <VStack
                    backgroundColor="background.neutral"
                    align="flex-start"
                    borderRadius="12px"
                    p={6}
                  >
                    <HStack align="flex-start">
                      <TitleMedium color={"content.link"}>
                        <MdInfoOutline />
                      </TitleMedium>
                      <TitleMedium color={"content.link"}>
                        {t("about-data-availability")}
                      </TitleMedium>
                    </HStack>
                    <BodyLarge>
                      {t("about-data-availability-description")}
                    </BodyLarge>
                  </VStack>
                  <Separator />
                  <Stack>
                    <VStack align="flex-start">
                      <HStack align="flex-start">
                        <TitleLarge>{t("how-data-was-scaled")}</TitleLarge>
                      </HStack>
                      <BodyLarge>
                        {t("about-data-availability-description")}
                      </BodyLarge>
                    </VStack>
                    {populations &&
                      populations.population &&
                      populations.countryPopulation && (
                        <HStack
                          width={"70%"}
                          justifyContent="center"
                          alignItems="center"
                          margin="24px auto"
                        >
                          <VStack>
                            <HeadlineLarge>
                              {populations.population}
                            </HeadlineLarge>
                            <LabelLarge paddingTop={4}>
                              {t("city-population")}
                            </LabelLarge>
                            <LabelLarge>{populations.year}</LabelLarge>
                          </VStack>
                          <VStack>
                            <BodyLarge fontSize={40}>/</BodyLarge>
                            <LabelLarge paddingTop={4}></LabelLarge>
                          </VStack>
                          <VStack>
                            <HeadlineLarge>
                              {populations.countryPopulation}
                            </HeadlineLarge>
                            <LabelLarge paddingTop={4}>
                              {t("country-population")}
                            </LabelLarge>
                            <LabelLarge>
                              {populations.countryPopulationYear}
                            </LabelLarge>
                          </VStack>
                          <VStack>
                            <BodyLarge fontSize={40}>=</BodyLarge>
                            <LabelLarge paddingTop={4}></LabelLarge>
                          </VStack>
                          <VStack>
                            <HeadlineLarge>
                              {populations.population /
                                populations.countryPopulation}
                            </HeadlineLarge>
                            <LabelLarge paddingTop={4}>
                              {t("scaling-factor")}
                            </LabelLarge>
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
                </Stack>
              </DrawerBody>
            )}
            {hideActions ? null : (
              <Stack
                w="full"
                className="drop-shadow-top border-t-2 justify-center items-center"
              >
                <Button
                  onClick={onConnectClick}
                  w="543px"
                  h={16}
                  my={6}
                  loading={isConnectLoading}
                >
                  {t("connect-data")}
                </Button>
              </Stack>
            )}
          </Stack>
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
}
