'use client'

import { useTranslation } from "@/i18n/client";
import { Button, Heading, Text } from "@chakra-ui/react";
import NextLink from 'next/link';
import { Trans } from "react-i18next/TransWithoutContext";

export default function Onboarding({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'onboarding');

  return (
    <div className="pt-[148px] w-[750px] max-w-full mx-auto px-4">
      <Heading size="xl" color="brand" mb={6}>{t('onboarding-heading')}</Heading>
      <Text color="tertiary">
        <Trans i18nKey="onboarding-details" t={t} />
      </Text>
      <NextLink href="/onboarding/setup" passHref legacyBehavior>
        <Button as="a" h={16} px={6} mt={8}>
          {t('start-button')}
        </Button>
      </NextLink>
    </div>
  );
}

