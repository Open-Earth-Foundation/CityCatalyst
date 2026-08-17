"use client";

import {
  DialogBackdrop,
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

interface DataLossWarningModalProps {
  isOpen: boolean;
  onOpenChange: (val: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  t: TFunction;
  /** `reset-upload` when Cancel clears the file; `leave` when navigating away. */
  variant?: "leave" | "reset-upload";
}

const DataLossWarningModal = ({
  isOpen,
  onOpenChange,
  onConfirm,
  onCancel,
  t,
  variant = "leave",
}: DataLossWarningModalProps) => {
  const isResetUpload = variant === "reset-upload";
  const titleKey = isResetUpload
    ? "reset-upload-warning-title"
    : "data-loss-warning-title";
  const messageKey = isResetUpload
    ? "reset-upload-warning-message"
    : "data-loss-warning-message";
  const confirmKey = isResetUpload ? "reset-upload-confirm" : "leave-page";

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) {
          onCancel();
        }
      }}
      onExitComplete={onCancel}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
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
          {t(titleKey)}
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
          <Box w="70%" mt={6}>
            <Text fontSize="body.lg" textAlign="center">
              {t(messageKey)}
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
          >
            {t("cancel")}
          </Button>
          <Button
            variant="solid"
            h="64px"
            w="200px"
            onClick={onConfirm}
            bg="sentiment.negativeDefault"
          >
            {t(confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default DataLossWarningModal;
