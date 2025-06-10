"use client";

import { useEffect } from "react";
import Cookies from "js-cookie";
import { Button, Center, VStack } from "@chakra-ui/react";

import { useTranslation } from "@/i18n/client";
import { fallbackLng } from "@/i18n/settings";
import { TitleLarge, TitleMedium } from "@/components/Texts/Title";
import { logger } from "@/services/logger";
import { BodyMedium } from "@/components/Texts/Body";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(error);
  }, [error]);

  const cookieLanguage = Cookies.get("i18next");
  const { t } = useTranslation(cookieLanguage ?? fallbackLng, "error");

  return (
    <Center h="100vh">
      <VStack p={4} alignItems="center" spaceX={4} spaceY={4}>
        <TitleLarge>{t("something-went-wrong")}</TitleLarge>
        <TitleMedium>{t("error-details")}</TitleMedium>
        <BodyMedium>
          {error.message}
          {error.digest}
        </BodyMedium>
        <Button
          onClick={
            // Attempt to recover by trying to re-render the segment
            () => reset()
          }
        >
          {t("try-again")}
        </Button>
      </VStack>
    </Center>
  );
}
