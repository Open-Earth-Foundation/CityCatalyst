"use client";

import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Box, Card, Grid, GridItem, Heading, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import AddDataCard from "@/components/Cards/add-data-card";
import { getSectorsForInventory, InventoryTypeEnum } from "@/util/constants";
import { api } from "@/services/api";

export default function AddDataIntro({
  params: { lng, inventory },
}: {
  params: { lng: string; inventory: string };
}) {
  const { t } = useTranslation(lng, "data");

  const { data: inventoryData } = api.useGetInventoryQuery(inventory);

  return (
    <Box className="pt-16 pb-16  w-[90%] max-w-full mx-auto px-4">
      <Link href="/" _hover={{ textDecoration: "none" }}>
        <Box display="flex" alignItems="center" gap="8px">
          <ArrowBackIcon boxSize={6} />
          <Text
            color="interactive.secondary"
            textTransform="uppercase"
            fontFamily="heading"
            fontSize="button.md"
            fontWeight="bold"
          >
            {t("go-back")}
          </Text>
        </Box>
      </Link>
      <Heading
        fontSize="32px"
        lineHeight="40px"
        fontWeight="semibold"
        data-testid="add-data-step-title"
        mb={6}
        mt={12}
        className="w-full"
      >
        {t("data-heading")}
      </Heading>
      <Text color="content.tertiary" className="w-full">
        <Trans
          i18nKey={
            inventoryData?.inventoryType === InventoryTypeEnum.GPC_BASIC
              ? "data-details"
              : "data-details-+"
          }
          t={t}
        >
          Add data or connect third-party data for your city and complete your
          city&apos;s emission inventory using the GPC Basic methodology.{" "}
          <Link
            className="underline"
            href="https://ghgprotocol.org/ghg-protocol-cities"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more
          </Link>
          about GPC Protocol
        </Trans>
      </Text>
      <Card mt={16} p={6} shadow="none">
        <Heading
          fontSize="24px"
          mb={1}
          fontWeight="semibold"
          lineHeight="32px"
          fontStyle="normal"
          textTransform="capitalize"
        >
          {t("data-view-heading")}
        </Heading>
        <Text color="content.tertiary">{t("data-view-details")}</Text>
        <Grid templateColumns="repeat(3, 1fr)" gap={4} mt={12}>
          {inventoryData &&
            getSectorsForInventory(inventoryData.inventoryType).map(
              ({ name, testId, description, icon, number, inventoryTypes }) => {
                const requiredScopes = inventoryData?.inventoryType
                  ? inventoryTypes[inventoryData.inventoryType].scopes
                  : [];
                const scopesRequiredText =
                  inventoryData?.inventoryType ===
                  InventoryTypeEnum.GPC_BASIC_PLUS
                    ? "scope-required-for-basic-+"
                    : "scope-required-for-basic";
                return (
                  <GridItem key={name}>
                    <AddDataCard
                      testId={testId}
                      title={t(name)}
                      description={t(description)}
                      // @ts-ignore
                      icon={icon}
                      scopeText={`${t(scopesRequiredText)}: ${requiredScopes.join(", ")}`}
                      buttonText={t("add-data")}
                      number={number}
                      inventory={inventory}
                    />
                  </GridItem>
                );
              },
            )}
        </Grid>
      </Card>
    </Box>
  );
}
