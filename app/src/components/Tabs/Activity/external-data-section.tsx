import {
  Badge,
  Box,
  Card,
  Center,
  Flex,
  Heading,
  Icon,
  Link,
  SimpleGrid,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import React, { useState } from "react";
import { TFunction } from "i18next";
import { InventoryValue } from "@/models/InventoryValue";
import HeadingText from "@/components/heading-text";
import {
  MdCheckCircleOutline,
  MdOutlineHomeWork,
  MdOutlineLocalShipping,
  MdOutlineDelete,
  MdOutlineFactory,
} from "react-icons/md";
import { LuWheat } from "react-icons/lu";
import { getTranslationFromDict } from "@/i18n";
import { DataCheckIcon } from "@/components/icons";
import { FiTarget } from "react-icons/fi";
import { SourceDrawer } from "@/components/GHGI/data-step/SourceDrawer";
import type { DataSourceWithRelations } from "@/components/GHGI/data-step/types";
import { api } from "@/services/api";
import { convertKgToTonnes } from "@/util/helpers";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { toaster } from "@/components/ui/toaster";

const ensureProtocol = (url?: string) => {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    return "https://" + url;
  }
  return url;
};

const ExternalDataSection = ({
  t,
  inventoryValue,
  numberFormat,
  onDisconnect,
}: {
  t: TFunction;
  inventoryValue: InventoryValue;
  numberFormat?: string;
  onDisconnect?: (datasourceId: string) => void;
}) => {
  const source = inventoryValue.dataSource;
  const [disconnectThirdPartyData, { isLoading: isDisconnectLoading }] =
    api.useDisconnectThirdPartyDataMutation();

  const {
    open: isSourceDrawerOpen,
    onClose: onSourceDrawerClose,
    onOpen: onSourceDrawerOpen,
  } = useDisclosure();
  const onSourceClick = (_source: DataSourceWithRelations, _data: any) => {
    onSourceDrawerOpen();
  };
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => setHovered(false);

  const onDisconnectThirdPartyData = async (
    _source: DataSourceWithRelations,
  ) => {
    try {
      await disconnectThirdPartyData({
        inventoryId: inventoryValue.inventoryId,
        datasourceId: inventoryValue.datasourceId,
      }).unwrap();
      toaster.create({
        title: t("disconnected-data-source"),
        type: "info",
        duration: 5000,
      });
      onDisconnect?.(inventoryValue.datasourceId!);
    } catch (_err) {
      toaster.create({
        title: t("disconnect-data-source-error"),
        type: "error",
        duration: 5000,
      });
    }
  };

  if (!source) {
    return (
      <Center>
        <Text
          fontFamily="heading"
          fontSize="10px"
          fontWeight="semibold"
          letterSpacing="widest"
          textTransform="uppercase"
          color="content.tertiary"
        >
          {t("source-not-found")}
        </Text>
      </Center>
    );
  }

  const refNum = inventoryValue.sector?.referenceNumber;
  const romanSector = refNum ?? "I";

  const sectorIcon = {
    I: MdOutlineHomeWork,
    II: MdOutlineLocalShipping,
    III: MdOutlineDelete,
    IV: MdOutlineFactory,
    V: LuWheat,
  }[romanSector] ?? MdOutlineHomeWork;

  return (
    <Box>
      <Text
        fontFamily="heading"
        fontSize="10px"
        fontWeight="semibold"
        letterSpacing="widest"
        textTransform="uppercase"
        color="content.tertiary"
      >
        {t("methodology")}
      </Text>
      <Box display="flex" justifyContent="space-between" marginBottom="48px">
        <Box>
          <HeadingText title={t("external-dataset-integrated")} />
          <Text
            letterSpacing="wide"
            fontSize="body.lg"
            fontWeight="normal"
            color="interactive.control"
          >
            {t("external-dataset-description")}
          </Text>
        </Box>
      </Box>
      <SimpleGrid
        columns={{
          base: 1,
          md: 2,
          lg: 3,
        }}
        gap="16px"
      >
        <Card.Root
          key={source.datasourceId}
          data-testid="source-card"
          variant="outline"
          borderWidth="1px"
          borderColor={hovered ? "semantic.danger" : "interactive.tertiary"}
          shadow="none"
          _hover={{ shadow: "xl" }}
          transition="all 300ms"
          w="full"
          p="24px"
          gap="4px"
        >
          <Card.Header p="0" display="flex" flexDirection="column" gap="0">
            <Icon
              as={sectorIcon}
              boxSize={9}
              color="content.tertiary-light"
              mb="10px"
            />
            <Flex direction="row" align="center" gap="8px">
              <Badge
                variant="plain"
                fontSize="label.sm"
                fontWeight="medium"
                fontFamily="heading"
                letterSpacing="widest"
                bg="background.graySubtle"
                color="content.secondary"
                px="8px"
                py="1px"
                borderRadius="md"
                lineHeight="1.2"
                borderWidth="0"
              >
                {source.subCategory?.referenceNumber ||
                  source.subSector?.referenceNumber}
              </Badge>
              <Tooltip showArrow content={source.subSector?.subsectorName}>
                <Text
                  fontSize="overline"
                  fontWeight="bold"
                  color="content.primary"
                  textTransform="uppercase"
                  letterSpacing="widest"
                  lineHeight="24"
                  fontFamily="heading"
                  lineClamp={1}
                >
                  {source.subSector?.subsectorName}
                </Text>
              </Tooltip>
            </Flex>
            <Heading
              fontSize="title.md"
              lineClamp={2}
              minHeight={10}
              mt="6px"
              lineHeight={24}
            >
              {getTranslationFromDict(source.datasetName)}
            </Heading>
            <Text fontSize="label.md" mt="4px">
              {t("by-data-source")}{" "}
              <Link
                href={ensureProtocol(source.publisher?.url)}
                target="_blank"
                textDecoration="underline"
                color="content.link"
                rel="noreferrer noopener"
              >
                {source.publisher?.name}
              </Link>
            </Text>
          </Card.Header>
          <Card.Body justifyContent="space-between" p="0" mt="12px">
            <Flex direction="row" mb={0} wrap="wrap" gap={2}>
              <Flex direction="row" gap="4px" flexWrap="nowrap">
                <Badge fontSize={12} borderColor="border.overlay" w="fit-content">
                  <Icon as={DataCheckIcon} boxSize={5} color="content.tertiary" />
                  {t("data-quality")}: {t("quality-" + source.dataQuality)}
                </Badge>
                {source.subCategory?.scope && (
                  <Badge fontSize={12} borderColor="border.overlay" w="fit-content">
                    <Icon as={FiTarget} boxSize={4} color="content.tertiary" />
                    {t("scope")}: {source.subCategory.scope.scopeName}
                  </Badge>
                )}
              </Flex>
            </Flex>
            <Text
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              overflow="hidden"
              color="content.tertiary"
              lineClamp={0}
              maxHeight="100px"
              fontFamily="body"
              fontSize="body.md"
              lineHeight="20px"
              fontWeight="regular"
              marginTop="8px"
            >
              {getTranslationFromDict(source.datasetDescription) ||
                getTranslationFromDict(source.methodologyDescription)}
            </Text>
            <VStack w="full" mb="16px" mt="12px">
              <Link
                textDecoration="underline"
                mt={4}
                mb={2}
                onClick={() => onSourceClick(source, null)}
                alignSelf="flex-start"
                fontSize="label.lg"
                fontWeight="medium"
                letterSpacing="wide"
              >
                {t("see-more-details")}
              </Link>
              <Button
                variant="outline"
                w="full"
                h="50px"
                bg={
                  hovered
                    ? "semantic.dangerOverlay"
                    : "semantic.successOverlay"
                }
                borderColor={
                  hovered
                    ? "semantic.danger"
                    : "semantic.success"
                }
                borderWidth="1px"
                color={
                  hovered
                    ? "semantic.danger"
                    : "semantic.success"
                }
                fontWeight="semibold"
                fontSize="14px"
                onClick={() => onDisconnectThirdPartyData(source)}
                loading={isDisconnectLoading}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <Icon as={MdCheckCircleOutline} />
                {hovered ? t("disconnect-data") : t("data-connected")}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>
      <Box
        w="full"
        borderTopWidth="3px"
        borderColor="interactive.secondary"
        py="32px"
        px="48px"
        marginTop="32px"
      >
        <Box display="flex" justifyContent="space-between">
          <Text
            fontFamily="heading"
            fontWeight="semibold"
            fontSize="headline.md"
          >
            {t("total-emissions")}
          </Text>
          <Text
            fontFamily="heading"
            fontWeight="semibold"
            fontSize="headline.md"
          >
            {convertKgToTonnes(inventoryValue.co2eq as bigint, numberFormat)}
          </Text>
        </Box>
      </Box>
      <SourceDrawer
        inventoryId={inventoryValue.inventoryId!}
        source={{ ...inventoryValue, ...source } as any}
        hideActions={true}
        totalEmissionsData={inventoryValue.co2eq as unknown as string}
        sourceData={null}
        sector={inventoryValue.sector}
        isOpen={isSourceDrawerOpen}
        onClose={onSourceDrawerClose}
        onConnectClick={() => { }}
        isConnectLoading={false}
        t={t}
        numberFormat={numberFormat}
        isConnected={true}
      />
    </Box>
  );
};

export default ExternalDataSection;
