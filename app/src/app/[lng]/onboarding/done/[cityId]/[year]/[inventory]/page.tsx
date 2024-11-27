"use client";

import { useTranslation } from "@/i18n/client";
import { useAppSelector } from "@/lib/hooks";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Box, Button, Card, Flex, Heading, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";
import { logger } from "@/services/logger";

export default function OnboardingDone({
  params: { lng, year, inventory },
}: {
  params: { lng: string; year: number; inventory: string };
}) {
  const data = useAppSelector((state) => state.openClimateCity.city);
  const { t } = useTranslation(lng, "onboarding");

  logger.debug(data);

  return (
    <div className="pt-[148px] w-[1024px] h-[100vh] max-w-full mx-auto px-4 pb-12 flex flex-col items-center">
      <Heading
        mt={12}
        mb="24px"
        fontSize="headline.md"
        color="content.alternative"
        data-testid="done-heading"
      >
        <Trans t={t}>done-heading</Trans>
      </Heading>
      <Box w="589px">
        <Text
          fontSize="body.lg"
          fontStyle="normal"
          letterSpacing="wide"
          lineHeight="24px"
          textAlign="center"
          color="content.tertiary"
        >
          {t("done-description")}
        </Text>
      </Box>
      <Box display="flex" gap="24px" mt="24px">
        <NextLink href={`/onboarding`} passHref legacyBehavior>
          <Button
            variant="ghost"
            as="a"
            h={16}
            px={6}
            bg="base.light"
            color="content.link"
            borderWidth="2px"
            borderColor="content.link"
            data-testid="add-new-inventory"
          >
            {t("add-new-inventory")}
          </Button>
        </NextLink>
        <NextLink href={`/${inventory}`} passHref legacyBehavior>
          <Button
            as="a"
            h={16}
            px={6}
            rightIcon={<ArrowForwardIcon boxSize={6} />}
            data-testid="check-dashboard"
          >
            {t("check-dashboard")}
          </Button>
        </NextLink>
      </Box>
    </div>
  );
}
