"use client";

import {
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Badge, Box, HStack, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import React from "react";
import { TbInfoTriangle } from "react-icons/tb";
import { TFunction } from "i18next";

interface ReplaceInventoryConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  year?: number | null;
  t: TFunction;
}

/**
 * Asks before a file import replaces an inventory that already has data.
 * Nothing is changed until the user confirms.
 */
const ReplaceInventoryConfirmModal = ({
  isOpen,
  onConfirm,
  onCancel,
  year,
  t,
}: ReplaceInventoryConfirmModalProps) => {
  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e) => {
        if (!e.open) {
          onCancel();
        }
      }}
    >
      {/* Opened from the import wizard's fixed footer (z-index 9999), so it
          has to sit above it to cover the footer with the backdrop. */}
      <DialogContent
        minH="300px"
        minW="600px"
        marginTop="2%"
        backdropProps={{ zIndex: 10000 }}
        positionerProps={{ zIndex: 10001 }}
      >
        <DialogHeader
          display="flex"
          justifyContent="center"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {t("replace-inventory-confirm-title")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Badge
            color="sentiment.warningDefault"
            h="68px"
            w="68px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            background="sentiment.warningOverlay"
          >
            <TbInfoTriangle size={36} />
          </Badge>
          <Box w="80%" mt={6} display="flex" flexDir="column" gap="12px">
            <Text fontSize="body.lg" textAlign="center">
              {t("replace-inventory-confirm-message", { year })}
            </Text>
            <Text
              fontSize="body.md"
              textAlign="center"
              color="content.secondary"
            >
              {t("replace-inventory-confirm-history")}
            </Text>
          </Box>
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
          display="flex"
          gap="16px"
          justifyContent="center"
        >
          <Button
            variant="outline"
            h="64px"
            w="200px"
            onClick={onCancel}
            data-testid="replace-inventory-cancel"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="solid"
            h="64px"
            minW="200px"
            onClick={onConfirm}
            bg="sentiment.negativeDefault"
            data-testid="replace-inventory-confirm"
          >
            {t("replace-inventory-confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default ReplaceInventoryConfirmModal;
