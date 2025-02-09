import type { SectorAttributes } from "@/models/Sector";
import {
  chakra,
  Flex,
  Heading,
  HStack,
  Icon,
  Link,
  Stack,
  TagLabel,
  Text,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { RefObject } from "react";
import {
  MdHomeWork,
  MdInfoOutline,
  MdOpenInNew,
  MdOutlineLocationOn,
  MdOutlineTimer,
  MdToday,
} from "react-icons/md";
import type { DataSourceData, DataSourceWithRelations } from "./types";
import { DataCheckIcon, ScaleIcon } from "@/components/icons";
import { FiTarget } from "react-icons/fi";
import { getTranslationFromDict } from "@/i18n";
import { convertKgToTonnes } from "@/util/helpers";
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tooltip } from "@/components/ui/tooltip";
import { Tag } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";

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
}) {
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
      size="lg"
    >
      <DrawerBackdrop />
      {/* <DrawerTrigger asChild>
        <Button
          variant="ghost"
          alignSelf="flex-start"
          onClick={onClose}
          px={6}
          py={4}
          mb={6}
        >
          <Icon as={MdArrowBack} boxSize={6} />
          {t("go-back")}
        </Button>
      </DrawerTrigger> */}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Drawer Title</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <Stack h="full" px={[4, 4, 16]} pt={12}>
            {source && (
              <DrawerBody className="space-y-6 overflow-auto" px={0}>
                <Icon as={MdHomeWork} boxSize={9} />
                <Heading
                  color="content.link"
                  textTransform="uppercase"
                  letterSpacing="1.25px"
                  fontSize="title.sm"
                  lineHeight="16px"
                >
                  {source.subcategoryId ? "Scope Data" : "Sub-sector Data"}
                </Heading>
                <Heading
                  color="content.tertiary"
                  textTransform="uppercase"
                  letterSpacing="1.25px"
                  fontSize="title.sm"
                  lineHeight="16px"
                >
                  {sector?.sectorName} /{" "}
                  {source.subSector?.subsectorName ||
                    source.subCategory?.subsector?.subsectorName}
                </Heading>

                <Heading
                  fontSize="32px"
                  lineHeight="40px"
                  textTransform="capitalize"
                >
                  {getTranslationFromDict(source.datasetName)}
                </Heading>

                <Heading fontSize="title.sm">
                  {source.subCategory?.referenceNumber ||
                    source.subSector?.referenceNumber}{" "}
                  {source.subCategory?.subcategoryName ||
                    source.subSector?.subsectorName}
                </Heading>

                <Text
                  color="content.link"
                  fontSize={12}
                  fontFamily="heading"
                  textTransform="capitalize"
                  fontWeight="500"
                  lineHeight="16px"
                  letterSpacing="0.5px"
                >
                  {t("by")}{" "}
                  <Link
                    href={source.publisher?.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    textDecoration="underline"
                  >
                    {source.publisher?.name}
                  </Link>
                </Text>

                <Heading fontSize="title.sm">
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
                </Heading>

                <HStack align="baseline">
                  <Heading fontSize="57px" lineHeight="64px">
                    {emissionsToBeIncluded().number}
                  </Heading>
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

                <Flex
                  direction="row"
                  my={4}
                  className="gap-4 flex-wrap"
                  alignItems="start"
                >
                  <Tag
                    startElement={
                      <Icon
                        as={MdOutlineLocationOn}
                        boxSize={6}
                        mr={2}
                        color="base.light"
                      />
                    }
                    bgColor="brand.secondary"
                    border={0}
                  >
                    <TagLabel textTransform="capitalize" color="base.light">
                      {t("Location")}:{" "}
                      {source.geographicalLocation?.toLowerCase()}
                    </TagLabel>
                  </Tag>
                  {source.subCategory?.scope && (
                    <Tag
                      bgColor="brand.secondary"
                      border={0}
                      startElement={
                        <Icon as={FiTarget} boxSize={6} color="base.light" />
                      }
                    >
                      <TagLabel color="base.light">
                        {t("scope")}: {source.subCategory.scope.scopeName}
                      </TagLabel>
                    </Tag>
                  )}
                  <Tag
                    bgColor="brand.secondary"
                    border={0}
                    startElement={
                      <Icon as={ScaleIcon} boxSize={6} color="base.light" />
                    }
                  >
                    <TagLabel color="base.light">
                      {t("scale")}: {t(source.spatialResolution || "unknown")}
                    </TagLabel>
                  </Tag>

                  <Tag
                    startElement={
                      <Icon
                        as={DataCheckIcon}
                        boxSize={6}
                        mr={2}
                        color="content.tertiary"
                      />
                    }
                  >
                    <TagLabel>
                      {t("data-quality")}: {t("quality-" + source.dataQuality)}
                    </TagLabel>
                  </Tag>
                  <Tag
                    startElement={
                      <Icon as={MdToday} boxSize={6} color="content.tertiary" />
                    }
                  >
                    <TagLabel>
                      {t("updated-every")}{" "}
                      {source.frequencyOfUpdate == "annual"
                        ? t("year")
                        : t(source.frequencyOfUpdate ?? "unknown")}
                    </TagLabel>
                  </Tag>
                  <Tag
                    startElement={
                      <Icon
                        as={MdOutlineTimer}
                        boxSize={6}
                        color="content.tertiary"
                      />
                    }
                  >
                    <TagLabel>
                      {source.startYear} - {source.endYear}
                    </TagLabel>
                  </Tag>
                </Flex>

                <Stack className="space-y-4">
                  <Heading fontSize="title.sm">{t("inside-dataset")}</Heading>
                  <Text color="content.tertiary">
                    {getTranslationFromDict(source.datasetDescription)}
                  </Text>
                  <chakra.hr borderColor="border.neutral" />
                  <Heading
                    verticalAlign="baseline"
                    lineHeight="24px"
                    fontSize="title.sm"
                  >
                    {t("methodology")}
                    <Link
                      href={source.methodologyUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <Icon
                        as={MdOpenInNew}
                        boxSize={6}
                        color="content.link"
                        mb="-5px"
                        ml={2}
                      />
                    </Link>
                  </Heading>
                  <Text color="content.tertiary">
                    {getTranslationFromDict(source.methodologyDescription)}
                  </Text>
                  <Heading
                    verticalAlign="baseline"
                    lineHeight="24px"
                    fontSize="title.sm"
                  >
                    {t("transform-data-heading")}
                    <Link
                      href="https://citycatalyst.openearth.org"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <Icon
                        as={MdOpenInNew}
                        boxSize={6}
                        color="content.link"
                        mb="-5px"
                        ml={2}
                      />
                    </Link>
                  </Heading>
                  <Text color="content.tertiary">
                    {getTranslationFromDict(source.transformationDescription)}
                  </Text>
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
