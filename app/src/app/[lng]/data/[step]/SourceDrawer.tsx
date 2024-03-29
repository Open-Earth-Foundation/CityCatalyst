import type { SectorAttributes } from "@/models/Sector";
import { ArrowBackIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  HStack,
  Heading,
  Icon,
  Link,
  Stack,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  Tooltip,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { RefObject } from "react";
import {
  MdHomeWork,
  MdOpenInNew,
  MdOutlineLocationOn,
  MdOutlineTimer,
  MdToday,
} from "react-icons/md";
import type { DataSourceData, DataSourceWithRelations } from "./types";
import { DataCheckIcon, ScaleIcon } from "@/components/icons";
import { FiTarget } from "react-icons/fi";

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
}: {
  source?: DataSourceWithRelations;
  sourceData?: DataSourceData;
  sector?: SectorAttributes;
  isOpen: boolean;
  onClose: () => void;
  onConnectClick: () => void;
  finalFocusRef?: RefObject<any>;
  isConnectLoading: boolean;
  t: TFunction;
}) {
  const emissionsData = sourceData?.totals?.emissions?.co2eq_100yr;
  // TODO scale this down for country data sources
  const totalEmissions = emissionsData
    ? ((Number(emissionsData) * sourceData?.scaleFactor) / 1000).toFixed(2)
    : "?";
  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      size="lg"
      finalFocusRef={finalFocusRef}
    >
      <DrawerOverlay />
      <DrawerContent px={0} py={0} overflowY="auto">
        <Stack h="full" px={[4, 4, 16]} pt={12}>
          <Button
            variant="ghost"
            alignSelf="flex-start"
            leftIcon={<ArrowBackIcon boxSize={6} />}
            onClick={onClose}
            px={6}
            py={4}
            mb={6}
          >
            {t("go-back")}
          </Button>
          {source && (
            <DrawerBody className="space-y-6 overflow-auto" px={0}>
              <Icon as={MdHomeWork} boxSize={9} />
              <Heading
                size="sm"
                color="content.link"
                textTransform="uppercase"
                letterSpacing="1.25px"
                fontSize="14px"
                lineHeight="16px"
              >
                {source.subcategoryId ? "Scope Data" : "Sub-sector Data"}
              </Heading>
              <Heading
                size="sm"
                color="content.tertiary"
                textTransform="uppercase"
                letterSpacing="1.25px"
                fontSize="14px"
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
                {source.datasetName}
              </Heading>

              <Heading size="sm">
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

              <Heading size="sm">
                {t("total-emissions-included")}{" "}
                <Tooltip
                  hasArrow
                  label={
                    t("total-emissions-tooltip") +
                    ".\nScale factor: " +
                    sourceData?.scaleFactor.toFixed(4)
                  }
                  placement="bottom-end"
                >
                  <InfoOutlineIcon color="interactive.control" boxSize={4} />
                </Tooltip>
              </Heading>

              <HStack align="baseline">
                <Heading fontSize="57px" lineHeight="64px">
                  {totalEmissions}
                </Heading>
                <Text
                  color="content.tertiary"
                  fontSize="22px"
                  lineHeight="28px"
                  fontFamily="heading"
                  fontWeight={600}
                >
                  TCO2e
                </Text>
              </HStack>

              <Flex
                direction="row"
                my={4}
                className="gap-4 flex-wrap"
                alignItems="start"
              >
                <Tag bgColor="brand.secondary" border={0}>
                  <TagLeftIcon
                    as={MdOutlineLocationOn}
                    boxSize={6}
                    mr={2}
                    color="base.light"
                  />
                  <TagLabel textTransform="capitalize" color="base.light">
                    {t("Location")}:{" "}
                    {source.geographicalLocation?.toLowerCase()}
                  </TagLabel>
                </Tag>
                {source.subCategory?.scope && (
                  <Tag bgColor="brand.secondary" border={0}>
                    <TagLeftIcon as={FiTarget} boxSize={6} color="base.light" />
                    <TagLabel color="base.light">
                      {t("scope")}: {source.subCategory.scope.scopeName}
                    </TagLabel>
                  </Tag>
                )}
                <Tag bgColor="brand.secondary" border={0}>
                  <TagLeftIcon as={ScaleIcon} boxSize={6} color="base.light" />
                  <TagLabel color="base.light">
                    {t("scale")}:{" "}
                    {source.accessType === "global-api"
                      ? t("city")
                      : t("country")}
                  </TagLabel>
                </Tag>

                <Tag>
                  <TagLeftIcon
                    as={DataCheckIcon}
                    boxSize={6}
                    mr={2}
                    color="content.tertiary"
                  />
                  <TagLabel>
                    {t("data-quality")}: {t("quality-" + source.dataQuality)}
                  </TagLabel>
                </Tag>
                <Tag>
                  <TagLeftIcon
                    as={MdToday}
                    boxSize={6}
                    color="content.tertiary"
                  />
                  <TagLabel>
                    {t("updated-every")}{" "}
                    {source.frequencyOfUpdate == "annual"
                      ? t("year")
                      : t(source.frequencyOfUpdate ?? "unknown")}
                  </TagLabel>
                </Tag>
                <Tag>
                  <TagLeftIcon
                    as={MdOutlineTimer}
                    boxSize={6}
                    color="content.tertiary"
                  />
                  <TagLabel>
                    {source.startYear} - {source.endYear}
                  </TagLabel>
                </Tag>
              </Flex>

              <Stack className="space-y-4">
                <Heading size="sm">{t("inside-dataset")}</Heading>
                <Text color="content.tertiary">
                  {source.datasetDescription}
                </Text>
                <chakra.hr borderColor="border.neutral" />
                <Heading
                  size="sm"
                  verticalAlign="baseline"
                  lineHeight="24px"
                  fontSize="16px"
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
                  {source.methodologyDescription}
                </Text>
                <Heading
                  size="sm"
                  verticalAlign="baseline"
                  lineHeight="24px"
                  fontSize="16px"
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
                  {source.transformationDescription}
                </Text>
              </Stack>
            </DrawerBody>
          )}
          <Stack
            w="full"
            className="drop-shadow-top border-t-2 justify-center items-center"
          >
            <Button
              onClick={onConnectClick}
              w="543px"
              h={16}
              my={6}
              isLoading={isConnectLoading}
            >
              {t("connect-data")}
            </Button>
          </Stack>
        </Stack>
      </DrawerContent>
    </Drawer>
  );
}
