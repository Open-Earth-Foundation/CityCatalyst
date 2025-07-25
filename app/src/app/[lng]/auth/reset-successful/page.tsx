"use client";
import { use } from "react";

import { useTranslation } from "@/i18n/client";
import { MdArrowForward } from "react-icons/md";
import { Button, Heading, Icon, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";

export default function ResetSuccessful(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "auth");

  return (
    <>
      <Heading size="xl">{t("reset-successful-heading")}</Heading>
      <Text my={4} color="content.tertiary">
        <Trans t={t}>reset-successful-details</Trans>
      </Text>
      <NextLink href="/">
        <Button h={16} width="full" mt={4}>
          {t("continue")} <Icon as={MdArrowForward} ml={2} boxSize={6} />
        </Button>
      </NextLink>
    </>
  );
}
