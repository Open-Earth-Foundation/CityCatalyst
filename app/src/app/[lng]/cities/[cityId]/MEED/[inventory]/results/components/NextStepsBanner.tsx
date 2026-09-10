"use client";
import React from "react";
import { Box, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowDown } from "react-icons/lu";
import type { TFunction } from "i18next";
import { MeedButton } from "../../../components/MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { FOCUS_RING_INVERSE } from "../../../focusRing";

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
    <Box bg="content.link" borderRadius="rounded" px="l" py="l">
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
        <MeedButton
          variant="filled"
          minW="auto"
          px="l"
          bg="base.light"
          color="content.link"
          _hover={{ bg: "background.neutral" }}
          rightIcon={<Icon as={LuArrowDown} boxSize="16px" />}
          onClick={onBrowseFullRanking}
          _focusVisible={FOCUS_RING_INVERSE}
        >
          {t("next-steps-action")}
        </MeedButton>
      </HStack>
    </Box>
  );
}
