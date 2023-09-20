"use client";

import { useTranslation } from "@/i18n/client";
import { useAppSelector } from "@/lib/hooks";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Button, Card, Flex, Heading, Text } from "@chakra-ui/react";
import Image from "next/image";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";

export default function OnboardingDone({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const data = useAppSelector((state) => state.openclimatecity.city);
  const { t } = useTranslation(lng, "onboarding");

  // TODO load these from the API
  const cityName = "Ciudad Autónoma de Buenos Aires";
  const year = "2023";

  return (
    <div className="pt-[148px] w-[1024px] max-w-full mx-auto px-4 pb-12 flex flex-col items-center">
      <Image
        src="/assets/check-circle.svg"
        width={64}
        height={64}
        alt="Checkmark"
      />
      <Heading size="xl" mt={12} mb={20}>
        <Trans t={t}>done-heading</Trans>
      </Heading>
      <Card w="full" px={6} py={8}>
        <Flex direction="row">
          <div className="rounded-full bg-brand w-8 h-8 mr-4 flex-grow-0" />
          <div className="max-w-full flex-shrink-1 space-y-4">
            <Heading fontSize="2xl">{data?.name}</Heading>
            <Heading fontSize="lg">{t("inventory-title", { year })}</Heading>
            <Text color="tertiary">
              <Trans t={t}>done-details</Trans>
            </Text>
          </div>
        </Flex>
      </Card>
      <div className="self-end">
        <NextLink href="/" passHref legacyBehavior>
          <Button
            as="a"
            h={16}
            px={6}
            mt={12}
            rightIcon={<ArrowForwardIcon boxSize={6} />}
          >
            {t("check-dashboard")}
          </Button>
        </NextLink>
      </div>
    </div>
  );
}
