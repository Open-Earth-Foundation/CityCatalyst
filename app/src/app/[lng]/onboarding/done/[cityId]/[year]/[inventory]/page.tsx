"use client";
import { use } from "react";

import { useTranslation } from "@/i18n/client";
import { MdArrowForward } from "react-icons/md";
import { Box, Button, Heading, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";
import { useSearchParams } from "next/navigation";

export default function OnboardingDone(props: {
  params: Promise<{ lng: string; year: number; inventory: string }>;
}) {
  const { lng, year, inventory } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  return (
    <Box
      pt="148px"
      w="1024px"
      h="100vh"
      maxW="full"
      mx="auto"
      px={4}
      pb={12}
      display="flex"
      flexDirection="column"
      alignItems="center"
      bgRepeat="no-repeat"
      backgroundPosition="top"
      bgImage="url('/images/city-bg.png')"
    >
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
        <NextLink href={`/${lng}/onboarding/setup?project=${projectId}`}>
          <Button
            variant="ghost"
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
        <NextLink href={`/${lng}/${inventory}`}>
          <Button h={16} px={6} data-testid="check-dashboard">
            {t("check-dashboard")}
            <MdArrowForward width="24px" height="24px" />
          </Button>
        </NextLink>
      </Box>
    </Box>
  );
}
