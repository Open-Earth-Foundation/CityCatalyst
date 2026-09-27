"use client";

import { Text, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { useTranslation } from "@/i18n/client";
import type { CityYearData } from "@/util/types";

const NEWEST = "newest";

interface InventorySelectionDialogProps {
  cityId: string;
  lng: string;
  onClose: () => void;
  onSelect: (inventoryId: string | null) => Promise<void>;
  options: CityYearData[];
  saving: boolean;
  selectedInventoryId: string | null;
}

/** Choose which city inventory year this run's context uses. */
export function InventorySelectionDialog({
  cityId,
  lng,
  onClose,
  onSelect,
  options,
  saving,
  selectedInventoryId,
}: InventorySelectionDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [value, setValue] = useState(selectedInventoryId ?? NEWEST);
  const [failed, setFailed] = useState(false);

  async function confirm(): Promise<void> {
    setFailed(false);
    try {
      await onSelect(value === NEWEST ? null : value);
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <DialogRoot open onOpenChange={({ open }) => !open && onClose()}>
      <DialogContent
        maxW="480px"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader px={6} pt={6}>
          <DialogTitle>{t("inventory-choose-title")}</DialogTitle>
        </DialogHeader>
        <DialogBody px={6} pb={4}>
          {options.length === 0 ? (
            <VStack align="stretch" gap={3}>
              <Text fontSize="body.md" color="content.secondary">
                {t("inventory-choose-empty")}
              </Text>
              <Button asChild size="sm" alignSelf="start">
                <NextLink href={`/${lng}/cities/${cityId}/GHGI/onboarding`}>
                  {t("create-inventory")}
                </NextLink>
              </Button>
            </VStack>
          ) : (
            <VStack align="stretch" gap={3}>
              <Text fontSize="body.md" color="content.secondary">
                {t("inventory-choose-description")}
              </Text>
              <RadioGroup
                value={value}
                onValueChange={({ value: next }) => next && setValue(next)}
              >
                <VStack align="stretch" gap={2}>
                  <Radio value={NEWEST}>
                    {t("inventory-choose-newest", { year: options[0].year })}
                  </Radio>
                  {options.map((option) => (
                    <Radio key={option.inventoryId} value={option.inventoryId}>
                      {t("inventory-year", { year: option.year })}
                    </Radio>
                  ))}
                </VStack>
              </RadioGroup>
              {failed && (
                <Text fontSize="body.sm" color="sentiment.negativeDefault">
                  {t("inventory-choose-error")}
                </Text>
              )}
            </VStack>
          )}
        </DialogBody>
        <DialogFooter
          borderTop="1px solid"
          borderColor="border.neutral"
          px={6}
          py={4}
          gap={2}
        >
          <Button size="sm" variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
          {options.length > 0 && (
            <Button
              size="sm"
              loading={saving}
              disabled={value === (selectedInventoryId ?? NEWEST)}
              onClick={() => void confirm()}
            >
              {t("inventory-choose-confirm")}
            </Button>
          )}
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
}
