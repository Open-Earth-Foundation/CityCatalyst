import i18next, { TFunction } from "i18next";
import {
  Box,
  Button,
  HStack,
  Text,
  VStack,
  Link,
  Icon,
} from "@chakra-ui/react";
import { InventoryResponse } from "@/util/types";
import type { Locale } from "date-fns";
import { enUS, pt, de, es } from "date-fns/locale";
import { formatDistance } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { BlueSubtitle } from "@/components/blue-subtitle";
import "dotenv/config";
import { FiExternalLink } from "react-icons/fi";
import {
  DialogRoot,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

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
    <DialogBody>
      <Text fontWeight="600" fontSize="title.lg">
        {t("public-city-inventory")}
      </Text>
      <Text>{t("manage-public-inventory-description")}</Text>
      <Box divideX="2px" my="24px" />
      <HStack justify="space-between">
        <VStack align="left">
          <Text fontWeight="600" fontSize="title.md">
            {URL}
          </Text>
          <Text fontWeight="400" fontSize="body.md">
            {t("published") + " " + relativeTime}
          </Text>
        </VStack>
        <Box>
          <Link as="a" href={URL} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost">
              <BlueSubtitle t={t} text="view-site" />
              <Icon as={FiExternalLink} fontSize="24px" />
            </Button>
          </Link>
        </Box>
      </HStack>
    </DialogBody>
  );
}
