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
import React, { useState } from "react";
import NextLink from "next/link";

export function InventoryPreferencesCard({
  t,
  isPublic,
}: {
  t: TFunction;
  isPublic: boolean;
}) {
  const [shouldShowInventoryPreferences, setShouldShowInventoryPreferences] =
    useState(false); // [ON-1840] hide until the feature is finished - don't forget (&& !isPublic)

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
            <NextLink
              data-testid={"inventory-preferences-testId"}
              href={`preferences`}
            >
              <Button> {t("set-inventory-preferences")}</Button>
            </NextLink>
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
