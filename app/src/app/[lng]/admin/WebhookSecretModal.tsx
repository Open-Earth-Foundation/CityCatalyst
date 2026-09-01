"use client";

import React, { FC } from "react";
import { TFunction } from "i18next";
import { Box, HStack, Icon, IconButton, Input, Text } from "@chakra-ui/react";
import { MdContentCopy } from "react-icons/md";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toaster } from "@/components/ui/toaster";

interface WebhookSecretModalProps {
  isOpen: boolean;
  secret: string | null;
  onClose: () => void;
  t: TFunction;
}

const WebhookSecretModal: FC<WebhookSecretModalProps> = ({
  isOpen,
  secret,
  onClose,
  t,
}) => {
  const handleCopy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toaster.create({
        title: t("webhook-secret-copied"),
        type: "success",
        duration: 2000,
      });
    } catch {
      toaster.create({
        title: t("error-message"),
        type: "error",
      });
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
    >
      <DialogBackdrop />
      <DialogContent minW="560px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="center"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          color="content.primary"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {t("webhook-secret-title")}
        </DialogHeader>
        <DialogCloseTrigger mt="2" color="interactive.control" mr="2" />
        <Box padding="24px">
          <Text color="content.tertiary" fontSize="body.lg" mb={4}>
            {t("webhook-secret-caption")}
          </Text>
          <HStack>
            <Input
              value={secret ?? ""}
              readOnly
              h="48px"
              fontFamily="mono"
              bg="background.neutral"
            />
            <IconButton
              aria-label={t("copy-secret")}
              onClick={handleCopy}
              variant="outline"
            >
              <Icon as={MdContentCopy} />
            </IconButton>
          </HStack>
        </Box>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            h="48px"
            w="full"
            bg="interactive.secondary"
            color="base.light"
            onClick={onClose}
          >
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default WebhookSecretModal;
