"use client";
import React from "react";
import { Box, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowDown } from "react-icons/lu";
import type { TFunction } from "i18next";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";

/**
 * Filled band that tells the user what to do with the ranking now that they
 * have read it, and drops them into the full table. The copy changes once
 * actions are selected so the instruction stops repeating itself.
 */
export function NextStepsBanner({
  selectedCount,
  onBrowseFullRanking,
  t,
}: {
  selectedCount: number;
  onBrowseFullRanking: () => void;
  t: TFunction;
}) {
  return (
    <Box bg="content.link" borderRadius="12px" px="l" py="l">
      <HStack
        justifyContent="space-between"
        alignItems="center"
        gap="l"
        flexWrap="wrap"
      >
        <VStack alignItems="stretch" gap="xs" maxW="560px">
          <TitleMedium color="base.light">{t("next-steps-title")}</TitleMedium>
          <BodySmall color="base.light">
            {selectedCount > 0
              ? t("next-steps-body-selected", { count: selectedCount })
              : t("next-steps-body")}
          </BodySmall>
        </VStack>
        <CCTerraButton
          variant="filled"
          minW="auto"
          px="l"
          bg="base.light"
          color="content.link"
          _hover={{ bg: "background.neutral" }}
          rightIcon={<Icon as={LuArrowDown} boxSize="16px" />}
          onClick={onBrowseFullRanking}
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "base.light",
            outlineOffset: "2px",
          }}
        >
          {t("next-steps-action")}
        </CCTerraButton>
      </HStack>
    </Box>
  );
}
