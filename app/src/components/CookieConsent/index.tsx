"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Text,
  Button,
  HStack,
  VStack,
  Link,
  Container,
  Flex,
  IconButton,
} from "@chakra-ui/react";
import { MdOutlineClose  } from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics";
import { hasServerFeatureFlag, FeatureFlags } from "@/util/feature-flags";

interface CookieConsentProps {
  lng: string;
}

export function CookieConsent({ lng }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation(lng, "cookie-consent");
  
  // Use hasServerFeatureFlag which uses process.env directly (no caching issues)
  const analyticsEnabled = hasServerFeatureFlag(FeatureFlags.ANALYTICS_ENABLED);

  // Check consent when component mounts
  useEffect(() => {
    if (!analyticsEnabled) {
      setIsLoading(false);
      setShowBanner(false);
      return;
    }

    const consent = getAnalyticsConsent();
    setShowBanner(consent === null);
    setIsLoading(false);
  }, [analyticsEnabled]);

  const handleAccept = () => {
    setAnalyticsConsent(true);
    setShowBanner(false);
  };

  const handleDecline = () => {
    setAnalyticsConsent(false);
    setShowBanner(false);
  };

  const handleClose = () => {
    // Closing without decision is treated as decline for GDPR compliance
    handleDecline();
  };

  if (isLoading || !showBanner) {
    return null;
  }

  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      bg="base.light"
      borderTop="1px"
      borderColor="border.overlay"
      boxShadow="0 -2px 10px rgba(0, 0, 0, 0.1)"
      zIndex={1000}
      p={4}
    >
      <Container maxW="container.xl">
        <Flex
          direction={{ base: "column", md: "row" }}
          align={{ base: "stretch", md: "center" }}
          justify="space-between"
          gap={4}
        >
          <VStack align="start"  flex={1}>
            <Text fontSize="sm" fontWeight="medium" color="">
            {t("title")}
            </Text>
            <Text fontSize="xs" color="base.dar" lineHeight="tall">
              {t("description")}{" "}
              <Link
                href="https://citycatalyst.openearth.org/privacy"
                textDecoration="underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("privacy-policy-link")}
              </Link>
              
            </Text>
          </VStack>

          <HStack flexShrink={0}>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDecline}
            >
              {t("decline")}
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
            >
              {t("accept")}
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={t("close-aria-label")}
              onClick={handleClose}
            >
              <MdOutlineClose />
            </IconButton>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

export default CookieConsent;