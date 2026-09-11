"use client";

import { useRef, useState } from "react";

import { Box, Icon, Text, VStack } from "@chakra-ui/react";
import { LuMessageSquarePlus } from "react-icons/lu";

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
import { toaster } from "@/components/ui/toaster";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import type { ConceptNoteRun } from "@/util/types";

interface StartNewChatDialogProps {
  cityId: string;
  lng: string;
  onClose: () => void;
  onReset: (run: ConceptNoteRun) => void;
  runId: string;
}

export function StartNewChatDialog({
  cityId,
  lng,
  onClose,
  onReset,
  runId,
}: StartNewChatDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetChat, resetState] = api.useResetConceptNoteChatMutation();

  async function reset(): Promise<void> {
    setError(null);
    try {
      const run = await resetChat({ cityId, runId }).unwrap();
      onReset(run);
      toaster.create({ title: t("start-new-chat-success"), type: "success" });
      onClose();
    } catch (requestError) {
      setError(
        isFetchBaseQueryError(requestError) && requestError.status === 409
          ? t("start-new-chat-conflict")
          : t("start-new-chat-error"),
      );
    }
  }

  return (
    <DialogRoot
      open
      onOpenChange={({ open }) => !open && !resetState.isLoading && onClose()}
      closeOnEscape={!resetState.isLoading}
      closeOnInteractOutside={!resetState.isLoading}
      initialFocusEl={() => cancelRef.current}
    >
      <DialogContent
        maxW="480px"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader
          display="block"
          borderBottom="1px solid"
          borderColor="border.neutral"
          px={6}
          py={5}
          pe={12}
        >
          <DialogTitle fontFamily="heading" fontSize="title.lg">
            {t("start-new-chat-dialog-title")}
          </DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger
          disabled={resetState.isLoading}
          aria-label={t("close")}
        />
        <DialogBody px={6} py={6}>
          <VStack align="stretch" gap={4}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxSize="48px"
              borderRadius="full"
              bg="sentiment.negativeOverlay"
              color="sentiment.negativeDefault"
            >
              <Icon as={LuMessageSquarePlus} boxSize={5} />
            </Box>
            <Text color="content.primary">
              {t("start-new-chat-dialog-description")}
            </Text>
            <Text fontSize="body.sm" color="content.tertiary">
              {t("start-new-chat-dialog-retention")}
            </Text>
            {error && (
              <Text
                role="alert"
                fontSize="body.sm"
                color="sentiment.negativeDefault"
              >
                {error}
              </Text>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter
          gap={3}
          borderTop="1px solid"
          borderColor="border.neutral"
          px={6}
          py={4}
        >
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={onClose}
            disabled={resetState.isLoading}
          >
            {t("cancel")}
          </Button>
          <Button
            bg="sentiment.negativeDefault"
            color="base.light"
            loading={resetState.isLoading}
            onClick={() => void reset()}
          >
            {t("start-new-chat-confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
