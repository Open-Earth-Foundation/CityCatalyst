"use client";
import React from "react";
import { HStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { TextLink } from "./TextLink";

/** "Select all" and "Clear" above a multi-select group (review feedback). */
export function SelectAllBar({
  total,
  selected,
  onSelectAll,
  onClear,
  t,
}: {
  total: number;
  selected: number;
  onSelectAll: () => void;
  onClear: () => void;
  t: TFunction;
}) {
  return (
    <HStack gap="l">
      <TextLink
        arrow={false}
        disabled={selected === total}
        onClick={onSelectAll}
      >
        {t("next-select-all")}
      </TextLink>
      <TextLink arrow={false} muted disabled={selected === 0} onClick={onClear}>
        {t("next-clear")}
      </TextLink>
    </HStack>
  );
}
