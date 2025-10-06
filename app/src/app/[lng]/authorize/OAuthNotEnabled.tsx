"use client";

import { useTranslation } from "@/i18n/client";
import { Box } from "@chakra-ui/react";

export default function OAuthNotEnabled({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, 'oauth')
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      width="100vw"
    >
      {t('oauth-not-enabled')}
    </Box>
  )
}