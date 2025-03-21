import type { SectorAttributes } from "@/models/Sector";
import {
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
import { MdArrowBack, MdHomeWork, MdInfoOutline } from "react-icons/md";
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
import { DisplayMedium } from "@/components/Texts/Display";
import ScalingSection from "./[subsector]/ScalingSection";
import { IoMdOpen } from "react-icons/io";

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
  const emissionsToBeIncluded = () => {
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
      converted = convertKgToTonnes(parseFloat(totalEmissions) * 1000);
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
                  <Separator />
                  <TitleMedium>
                    {t("methodology")}
                    <Link
                      href={source.methodologyUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <Icon
                        as={IoMdOpen}
                        boxSize={4}
                        color="interactive.secondary"
                      />
                    </Link>
                  </TitleMedium>
                  <BodyLarge>
                    {getTranslationFromDict(source.methodologyDescription)}
                  </BodyLarge>
                  <TitleMedium>
                    {t("transform-data-heading")}
                    {/* TODO get link from design or previous version */}
                    <Link href={""} rel="noopener noreferrer" target="_blank">
                      <Icon
                        as={IoMdOpen}
                        boxSize={4}
                        color="interactive.secondary"
                      />
                    </Link>
                  </TitleMedium>
                  <BodyLarge>
                    {getTranslationFromDict(source.transformationDescription)}
                  </BodyLarge>
                  <TitleMedium>{t("disaggregated-analysis")}</TitleMedium>
                  {sourceData?.records && (
                    <SourceDrawerActivityTable
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
                  <ScalingSection
                    source={source}
                    t={t}
                    inventoryId={inventoryId}
                  />
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
