"use client";

import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon, ArrowForwardIcon, LinkIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import {
  Box,
  Button,
  Card,
  Divider,
  Flex,
  Heading,
  Icon,
  Text,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineHomeWork } from "react-icons/md";
import { FiTrash2, FiTruck } from "react-icons/fi";
import { BsPlus } from "react-icons/bs";
import AddDataCard from "@/components/Cards/add-data-card";

export default function AddDataIntro({
  params: { lng, inventory },
}: {
  params: { lng: string; inventory: string };
}) {
  const { t } = useTranslation(lng, "data");

  const SECTORCARD_DATA = [
    {
      sectorName: t("stationary-energy"),
      descriptionText: t("stationary-energy-details"),
      scope: t("stationary-energy-scope"),
      buttonText: "Add Data",
      icon: MdOutlineHomeWork,
      step: 1,
    },
    {
      sectorName: t("transportation"),
      descriptionText: t("transportation-details"),
      scope: t("transportation-scope"),
      buttonText: "Add Data",
      icon: FiTruck,
      step: 2,
    },
    {
      sectorName: t("waste"),
      descriptionText: t("waste-details"),
      scope: t("waste-scope"),
      buttonText: "Add Data",
      icon: FiTrash2,
      step: 3,
    },
  ];

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
          {SECTORCARD_DATA.map(
            ({
              sectorName,
              descriptionText,
              scope,
              icon,
              buttonText,
              step,
            }) => (
              <AddDataCard
                key={sectorName}
                title={sectorName}
                description={descriptionText}
                icon={icon}
                scopeText={scope}
                buttonText={buttonText}
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
