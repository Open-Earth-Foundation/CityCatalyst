"use client";

import { useTranslation } from "@/i18n/client";
import { useAppSelector } from "@/lib/hooks";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Box, Button, Card, Flex, Heading, Text } from "@chakra-ui/react";
import Image from "next/image";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";
import { logger } from "@/services/logger";
import { CircleFlag } from "react-circle-flags";

export default function OnboardingDone({
  params: { lng, year, inventory },
}: {
  params: { lng: string; year: number; inventory: string };
}) {
  const data = useAppSelector((state) => state.openClimateCity.city);
  const { t } = useTranslation(lng, "onboarding");

  logger.debug(data);

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
        <Flex direction="row" gap="8px">
          <Box>
            <CircleFlag
              countryCode={data?.actor_id.substring(0, 2).toLowerCase() || ""}
              width={32}
            />
          </Box>
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
        <NextLink href={`/${inventory}`} passHref legacyBehavior>
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
