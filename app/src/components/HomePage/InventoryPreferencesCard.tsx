import {
  Button,
  Card,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { IoIosClose } from "react-icons/io";
import { TFunction } from "i18next";
import { useState } from "react";

export function InventoryPreferencesCard({ t }: { t: TFunction }) {
  const [shouldShowInventoryPreferences, setShouldShowInventoryPreferences] =
    useState(true);

  return (
    <>
      {shouldShowInventoryPreferences && (
        <Card mt="80px" width="full" backgroundColor="background.neutral">
          <HStack>
            <VStack align={"left"}>
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="semibold"
                lineHeight="24"
                my={4}
                textColor={"blue"}
              >
                {t("set-inventory-preferences")}
              </Text>
              <Text> {t("discover-relevant-subsectors")}</Text>
            </VStack>
            <Button> {t("set-inventory-preferences")}</Button>
            <IconButton
              variant="ghost"
              icon={<IoIosClose />}
              onClick={() => setShouldShowInventoryPreferences(false)}
              aria-label={"close"}
            />
          </HStack>
        </Card>
      )}
    </>
  );
}
