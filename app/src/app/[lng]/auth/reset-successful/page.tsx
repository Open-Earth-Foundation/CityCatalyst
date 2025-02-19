"use client";

import { useTranslation } from "@/i18n/client";
import { MdArrowForward } from "react-icons/md";
import { Button, Heading, Icon, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";

export default function ResetSuccessful({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "auth");
  return (
    <>
      <Heading size="xl">{t("reset-successful-heading")}</Heading>
      <Text className="my-4" color="#7A7B9A">
        <Trans t={t}>reset-successful-details</Trans>
      </Text>
      <NextLink href="/" passHref legacyBehavior>
        <Button as="a" h={16} width="full" mt={4}>
          {t("continue")} <Icon as={MdArrowForward} ml={2} boxSize={6} />
        </Button>
      </NextLink>
    </>
  );
}
