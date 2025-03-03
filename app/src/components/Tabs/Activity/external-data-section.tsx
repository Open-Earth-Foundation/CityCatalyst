import {
  Box,
  Button,
  Card,
  Center,
  Flex,
  Heading,
  Icon,
  Link,
  SimpleGrid,
  Tag,
  TagLabel,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import React, { useState } from "react";
import { TFunction } from "i18next";
import { InventoryValue } from "@/models/InventoryValue";
import HeadingText from "@/components/heading-text";
import { MdHomeWork } from "react-icons/md";
import { getTranslationFromDict } from "@/i18n";
import { DataCheckIcon } from "@/components/icons";
import { FiCheckCircle, FiTarget } from "react-icons/fi";
import { SourceDrawer } from "@/app/[lng]/[inventory]/data/[step]/SourceDrawer";
import type { DataSourceWithRelations } from "@/app/[lng]/[inventory]/data/[step]/types";
import { api } from "@/services/api";
import { convertKgToTonnes } from "@/util/helpers";
import { UseErrorToast } from "@/hooks/Toasts";

const ExternalDataSection = ({
  t,
  inventoryValue,
}: {
  t: TFunction;
  inventoryValue: InventoryValue;
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
    // setSelectedSource(source);
    // setSelectedSourceData(data);
    onSourceDrawerOpen();
  };
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => setHovered(false);

  const buttonContent = hovered ? t("disconnect-data") : t("data-connected");
  const buttonIcon = !hovered ? <Icon as={FiCheckCircle} /> : null;
  const buttonColorScheme = hovered ? "danger" : "primary"; // TODO create these color palletes
  const { showErrorToast } = UseErrorToast({
    title: "disconnected-data-source",
  });

  const onDisconnectThirdPartyData = async (
    _source: DataSourceWithRelations,
  ) => {
    await disconnectThirdPartyData({
      inventoryId: inventoryValue.inventoryId,
      datasourceId: inventoryValue.datasourceId,
    });
    showErrorToast();
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
      <SimpleGrid columns={3} spaceX={4} spaceY={4}>
        <Card.Root
          key={source.datasourceId}
          variant="outline"
          borderColor={hovered ? "semantic.danger" : "interactive.tertiary"}
          borderWidth={2}
          className="shadow-none hover:drop-shadow-xl transition-shadow"
        >
          {/* TODO add icon to DataSource */}
          <Icon as={MdHomeWork} boxSize={9} mb={6} />
          <Heading size="sm" lineClamp={2} minHeight={10}>
            {getTranslationFromDict(source.datasetName)}
          </Heading>
          <Flex direction="row" my={4} wrap="wrap" gap={2}>
            <Tag.Root>
              <Tag.StartElement>
                <Icon as={DataCheckIcon} boxSize={5} color="content.tertiary" />
              </Tag.StartElement>
              <Tag.Label fontSize={11}>
                {t("data-quality")}: {t("quality-" + source.dataQuality)}
              </Tag.Label>
            </Tag.Root>
            {source.subCategory?.scope && (
              <Tag.Root>
                <Tag.StartElement>
                  <Icon as={FiTarget} boxSize={4} color="content.tertiary" />
                </Tag.StartElement>
                <TagLabel fontSize={11}>
                  {t("scope")}: {source.subCategory.scope.scopeName}
                </TagLabel>
              </Tag.Root>
            )}
          </Flex>
          <Text color="content.tertiary" lineClamp={5} minHeight={120}>
            {getTranslationFromDict(source.datasetDescription) ||
              getTranslationFromDict(source.methodologyDescription)}
          </Text>
          <Link
            className="underline"
            mt={4}
            mb={6}
            onClick={() => onSourceClick(source, null)}
          >
            {t("see-more-details")}
          </Link>
          <Button
            variant="solid"
            colorScheme={buttonColorScheme}
            px={6}
            py={4}
            onClick={() => onDisconnectThirdPartyData(source)}
            loading={isDisconnectLoading}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {buttonIcon}
            {buttonContent}
          </Button>
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
            {convertKgToTonnes(inventoryValue.co2eq as bigint)}
          </Text>
        </Box>
      </Box>
      <SourceDrawer
        inventoryId={inventoryValue.inventoryId!}
        source={{ ...inventoryValue, ...source }}
        hideActions={true}
        totalEmissionsData={inventoryValue.co2eq as unknown as string}
        sourceData={null}
        sector={inventoryValue.sector}
        isOpen={isSourceDrawerOpen}
        onClose={onSourceDrawerClose}
        onConnectClick={() => {}}
        isConnectLoading={false}
        t={t}
      />
    </Box>
  );
};

export default ExternalDataSection;
