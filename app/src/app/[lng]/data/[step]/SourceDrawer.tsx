import type { SectorAttributes } from "@/models/Sector";
import { ArrowBackIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
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
  MdCalendarToday,
  MdHomeWork,
  MdOpenInNew,
  MdOutlineLocationOn,
  MdOutlineTimer,
  MdPlaylistAddCheck,
  MdToday,
} from "react-icons/md";
import type { DataSourceWithRelations } from "./types";
import { DataCheckIcon, ScaleIcon } from "@/components/icons";
import { FiTarget } from "react-icons/fi";

export function SourceDrawer({
  source,
  sector,
  isOpen,
  onClose,
  onConnectClick,
  finalFocusRef,
  isConnectLoading,
  t,
}: {
  source?: DataSourceWithRelations;
  sector?: SectorAttributes;
  isOpen: boolean;
  onClose: () => void;
  onConnectClick: () => void;
  finalFocusRef?: RefObject<any>;
  isConnectLoading: boolean;
  t: TFunction;
}) {
  console.dir(source);
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
        <chakra.div h="full" px={[4, 4, 16]} py={12}>
          <Button
            variant="ghost"
            leftIcon={<ArrowBackIcon boxSize={6} />}
            onClick={onClose}
            px={6}
            py={4}
            mb={6}
          >
            {t("go-back")}
          </Button>
          {source && (
            <DrawerBody className="space-y-6" px={0}>
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

              <Heading fontSize="16px" lineHeight="24px">
                {t("total-emissions-included")}{" "}
                <Tooltip
                  hasArrow
                  label={t("total-emissions-tooltip")}
                  placement="bottom-end"
                >
                  <InfoOutlineIcon color="interactive.control" boxSize={4} />
                </Tooltip>
              </Heading>

              <HStack align="baseline">
                <Heading fontSize="57px" lineHeight="64px">
                  999.99
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
                <Text color="content.tertiary">{source.description}</Text>
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
                  {/* TODO add methodology description to data source model/ data catalog */}
                </Text>
              </Stack>
            </DrawerBody>
          )}
          <Stack
            w="full"
            className="drop-shadow-top border-t-2 absolute left-0 flex justify-center items-center"
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
        </chakra.div>
      </DrawerContent>
    </Drawer>
  );
}
