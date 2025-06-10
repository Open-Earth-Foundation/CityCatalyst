"use client";

import { useEffect } from "react";
import { useTranslation } from "@/i18n/client";
import { Box, Button, Center } from "@chakra-ui/react";
import { TitleMedium } from "@/components/Texts/Title";
import { logger } from "@/services/logger";
import Cookies from "js-cookie";
import { fallbackLng } from "@/i18n/settings";

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
    <Center>
      <Box p={4}>
        <TitleMedium mb={4}>{t("something-went-wrong")}</TitleMedium>
        <Button
          onClick={
            // Attempt to recover by trying to re-render the segment
            () => reset()
          }
        >
          {t("try-again")}
        </Button>
      </Box>
    </Center>
  );
}
