"use client";

import React, { FC } from "react";
import { TFunction } from "i18next";
import { Badge, HStack, Text } from "@chakra-ui/react";
import { FiTrash2 } from "react-icons/fi";
import { Trans } from "react-i18next";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import type { WebhookSubscriptionResponse } from "@/util/types";

interface DeleteWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (val: boolean) => void;
  organizationId: string;
  webhook: WebhookSubscriptionResponse | null;
  t: TFunction;
}

const DeleteWebhookModal: FC<DeleteWebhookModalProps> = ({
  isOpen,
  onClose,
  onOpenChange,
  organizationId,
  webhook,
  t,
}) => {
  const [deleteWebhook, { isLoading }] =
    api.useDeleteOrganizationWebhookMutation();
  const { showErrorToast } = UseErrorToast({
    title: t("webhook-delete-error"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("webhook-deleted"),
    duration: 1200,
  });

  const handleDelete = async () => {
    if (!webhook) return;
    const response = await deleteWebhook({
      organizationId,
      webhookId: webhook.id,
    });
    if ("data" in response) {
      showSuccessToast();
      onClose();
    } else {
      showErrorToast();
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) onClose();
      }}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
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
          {t("delete-webhook")}
        </DialogHeader>
        <DialogCloseTrigger mt="2" color="interactive.control" mr="2" />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Badge
            color="sentiment.negativeDefault"
            h="68px"
            w="68px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            background="sentiment.negativeOverlay"
          >
            <FiTrash2 size={36} />
          </Badge>
          <Text
            w="full"
            maxW="450px"
            textAlign="center"
            mt={6}
            fontSize="body.lg"
          >
            <Trans
              i18nKey="confirm-webhook-delete"
              t={t}
              values={{ name: webhook?.name ?? "" }}
              components={{ bold: <strong /> }}
            />
          </Text>
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            variant="solid"
            h="64px"
            w="full"
            onClick={handleDelete}
            color="base.light"
            backgroundColor="sentiment.negativeDefault"
            loading={isLoading}
          >
            {t("delete-webhook")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default DeleteWebhookModal;
