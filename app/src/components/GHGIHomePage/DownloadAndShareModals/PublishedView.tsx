import i18next, { TFunction } from "i18next";
import { Box, Button, Icon, Text, VStack } from "@chakra-ui/react";
import { InventoryResponse } from "@/util/types";
import type { Locale } from "date-fns";
import { enUS, pt, de, es } from "date-fns/locale";
import { formatDistance } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { FiExternalLink } from "react-icons/fi";

export function PublishedView({
  inventoryId,
  inventory,
  t,
}: {
  inventoryId: string;
  inventory: InventoryResponse;
  t: TFunction;
}) {
  const getLocale = (language: string): Locale => {
    switch (language) {
      case "pt":
        return pt;
      case "es":
        return es;
      case "de":
        return de;
      default:
        return enUS;
    }
  };

  const lng = i18next.language;
  const relativeTime =
    inventory.publishedAt &&
    formatDistance(inventory.publishedAt, toZonedTime(new Date(), "GMT"), {
      addSuffix: true,
      locale: getLocale(lng),
    });

  const URL = `${window.location.protocol}//${window.location.host}/${lng}/public/${inventoryId}`;

  return (
    <>
      <Text
        color="content.primary"
        fontFamily="body"
        fontSize="body.md"
        fontWeight="regular"
        lineHeight="20"
        letterSpacing="wide"
      >
        {t("manage-public-inventory-description")}
      </Text>
      <Box divideX="2px" my="10px" />
      <VStack align="left" gap={3}>
        <Box>
          <Button
            variant="outline"
            onClick={() => window.open(URL, "_blank", "noopener,noreferrer")}
          >
            <Text
              color="content.link"
              textAlign="center"
              fontFamily="heading"
              fontSize="button.md"
              fontWeight="semibold"
              lineHeight="16"
              letterSpacing="wider"
              textTransform="uppercase"
            >
              {t("view-site")}
            </Text>
            <Icon as={FiExternalLink} fontSize="24px" />
          </Button>
        </Box>
        <Text
          color="content.tertiary"
          fontFamily="body"
          fontSize="body.sm"
          fontWeight="regular"
          lineHeight="16"
          letterSpacing="wide"
        >
          {t("published") + " " + relativeTime}
        </Text>
      </VStack>
    </>
  );
}
