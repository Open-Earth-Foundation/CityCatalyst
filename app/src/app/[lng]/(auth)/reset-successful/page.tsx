'use client'

import { useTranslation } from "@/i18n/client";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { Button, Heading, Text } from "@chakra-ui/react";
import NextLink from 'next/link';

export default function ResetSuccessful({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, 'reset-successful');
  return (
    <>
      <Heading size="xl">{t('reset-successful-heading')}</Heading>
      <Text className="my-4" color="#7A7B9A">
        {t('reset-successful-details')}
      </Text>
      <NextLink href="/" passHref legacyBehavior>
        <Button as="a" h={16} width="full" mt={4}>
          {t('continue')} <ArrowForwardIcon ml={2} boxSize={6} />
        </Button>
      </NextLink>
    </>
  );
}

