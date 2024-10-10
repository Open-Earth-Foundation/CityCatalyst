"use client";

import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import { Box, Card, Flex, Heading, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import AddDataCard from "@/components/Cards/add-data-card";
import { SECTORS } from "@/app/sectors";

export default function AddDataIntro({
  params: { lng, inventory },
}: {
  params: { lng: string; inventory: string };
}) {
  const { t } = useTranslation(lng, "data");

  return (
    <Box className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4">
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
        <Trans i18nKey="data-details" t={t}>
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
        <Flex className="space-x-4" mt={12}>
          {SECTORS.map(
            ({ sectorName, testId, descriptionText, scope, icon, step }) => (
              <AddDataCard
                testId={testId}
                key={sectorName}
                title={t(sectorName)}
                description={t(descriptionText)}
                icon={icon}
                scopeText={t(scope)}
                buttonText={t("add-data")}
                step={step}
                inventory={inventory}
              />
            ),
          )}
        </Flex>
      </Card>
    </Box>
  );
}
