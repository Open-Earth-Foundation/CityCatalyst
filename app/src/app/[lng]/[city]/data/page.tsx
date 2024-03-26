"use client";

import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon, ArrowForwardIcon } from "@chakra-ui/icons";
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
import { useRouter } from "next/navigation";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineHomeWork } from "react-icons/md";
import { FiTrash2, FiTruck } from "react-icons/fi";

export default function AddDataIntro({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "data");
  const router = useRouter();

  return (
    <Box className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4">
      <Button
        variant="ghost"
        leftIcon={<ArrowBackIcon boxSize={6} />}
        onClick={() => router.back()}
      >
        Go Back
      </Button>
      <Heading
        fontSize="32px"
        lineHeight="40px"
        fontWeight="semibold"
        mb={6}
        mt={12}
        className="w-full text-center"
      >
        {t("data-heading")}
      </Heading>
      <Text color="content.tertiary" className="w-full text-center">
        <Trans i18nKey="data-details" t={t} />
      </Text>
      <Card mt={16} p={6} borderColor="border.overlay" borderWidth={1}>
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
        <Text color="content.tertiary">
          <Trans i18nKey="data-view-details" t={t}>
            GPC Basic encompasses three primary sectors: Stationary Energy,
            Transportation and Waste . Fill out the necessary data for each
            sector to build a comprehensive GHG inventory.{" "}
            <Link
              className="underline"
              href="https://ghgprotocol.org/ghg-protocol-cities"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </Link>
          </Trans>
        </Text>
        <Flex className="space-x-4" mt={12}>
          <Card
            className="space-y-6 grow w-1/3"
            boxShadow="none"
            p={6}
            borderColor="border.overlay"
            borderWidth={1}
          >
            <Icon as={MdOutlineHomeWork} boxSize={8} color="brand.secondary" />
            <Heading size="md">{t("stationary-energy")}</Heading>
            <Divider borderColor="border.overlay" />
            <Text color="content.tertiary">
              {t("stationary-energy-details")}
            </Text>
            <div className="grow" />
            <Heading size="sm" color="brand.secondary" className="font-normal">
              {t("stationary-energy-scope")}
            </Heading>
          </Card>
          <Card
            className="space-y-6 grow w-1/3"
            boxShadow="none"
            p={6}
            borderColor="border.overlay"
            borderWidth={1}
          >
            <Icon as={FiTruck} boxSize={8} color="brand.secondary" />
            <Heading size="md">{t("transportation")}</Heading>
            <Divider borderColor="border.overlay" />
            <Text color="content.tertiary">{t("transportation-details")}</Text>
            <div className="grow" />
            <Heading size="sm" color="brand.secondary" className="font-normal">
              {t("transportation-scope")}
            </Heading>
          </Card>
          <Card
            className="space-y-6 grow w-1/3"
            boxShadow="none"
            p={6}
            borderColor="border.overlay"
            borderWidth={1}
          >
            <Icon as={FiTrash2} boxSize={8} color="brand.secondary" />
            <Heading size="md">{t("waste")}</Heading>
            <Divider borderColor="border.overlay" />
            <Text color="content.tertiary">{t("waste-details")}</Text>
            <div className="grow" />
            <Heading size="sm" color="brand.secondary" className="font-normal">
              {t("waste-scope")}
            </Heading>
          </Card>
        </Flex>
      </Card>
      <div className="w-full text-right my-12">
        <NextLink href="/data/1" passHref legacyBehavior>
          <Button
            as="a"
            h={16}
            px={6}
            rightIcon={<ArrowForwardIcon boxSize={6} />}
          >
            {t("add-data-to-inventory")}
          </Button>
        </NextLink>
      </div>
    </Box>
  );
}
