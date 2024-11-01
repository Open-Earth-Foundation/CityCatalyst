import i18next, { TFunction } from "i18next";
import {
  Box,
  Button,
  Divider,
  HStack,
  ModalBody,
  Text,
  VStack,
} from "@chakra-ui/react";
import { InventoryResponse } from "@/util/types";
import type { Locale } from "date-fns";
import { enUS, pt, de, es } from "date-fns/locale";
import { formatDistance } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { BlueSubtitle } from "@/components/blue-subtitle";
import { ExternalLinkIcon } from "@chakra-ui/icons";

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
  try {
    console.log("process.env", JSON.stringify(process.env)); // TODO NINA
  } catch (e) {
  } finally {
    console.log(
      "process.env.NEXT_PUBLIC_HOST",
      JSON.stringify(process.env.NEXT_PUBLIC_HOST),
    ); // TODO NINA
  }
  const URL = `${process.env.NEXT_PUBLIC_HOST}/${lng}/public/${inventoryId}`;
  return (
    <ModalBody>
      <Text fontWeight="600" fontSize="title.lg">
        {t("public-city-inventory")}
      </Text>
      <Text>{t("manage-public-inventory-description")}</Text>
      <Divider my="24px" />
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
          <Button
            as="a"
            href={URL}
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            rightIcon={<ExternalLinkIcon fontSize="24px" />}
          >
            <BlueSubtitle t={t} text="view-site" />
          </Button>
        </Box>
      </HStack>
    </ModalBody>
  );
}
