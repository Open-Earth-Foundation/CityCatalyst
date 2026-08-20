"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";

import { Box, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";

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
import { Field } from "@/components/ui/field";
import { toaster } from "@/components/ui/toaster";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import type { ConceptNoteRun } from "@/util/types";

export type ConceptNoteLifecycleAction = "rename" | "delete";

interface LifecycleDialogProps {
  action: ConceptNoteLifecycleAction;
  cityId: string;
  lng: string;
  onClose: () => void;
  run: ConceptNoteRun;
}

export function ConceptNoteLifecycleDialog({
  action,
  cityId,
  lng,
  onClose,
  run,
}: LifecycleDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(run.name);
  const [error, setError] = useState<string | null>(null);
  const [renameRun, renameState] = api.useRenameConceptNoteRunMutation();
  const [deleteRun, deleteState] = api.useDeleteConceptNoteRunMutation();
  const isRename = action === "rename";
  const loading = isRename ? renameState.isLoading : deleteState.isLoading;

  async function rename(event: FormEvent): Promise<void> {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError(t("rename-name-required"));
      return;
    }
    try {
      await renameRun({
        cityId,
        name: normalizedName,
        runId: run.run_id,
      }).unwrap();
      toaster.create({ title: t("rename-success"), type: "success" });
      onClose();
    } catch {
      setError(t("rename-error"));
    }
  }

  async function remove(): Promise<void> {
    setError(null);
    try {
      await deleteRun({
        cityId,
        runId: run.run_id,
      }).unwrap();
      toaster.create({ title: t("delete-success"), type: "success" });
      onClose();
    } catch (requestError) {
      setError(
        isFetchBaseQueryError(requestError) && requestError.status === 409
          ? t("delete-conflict")
          : t("delete-error"),
      );
    }
  }

  return (
    <DialogRoot
      open
      onOpenChange={({ open }) => !open && !loading && onClose()}
      closeOnEscape={!loading}
      closeOnInteractOutside={!loading}
      initialFocusEl={() => (isRename ? inputRef.current : cancelRef.current)}
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
            {t(isRename ? "rename-dialog-title" : "delete-dialog-title")}
          </DialogTitle>
          {isRename && (
            <Text mt={1} fontSize="body.sm" color="content.tertiary">
              {t("rename-dialog-description")}
            </Text>
          )}
        </DialogHeader>
        <DialogCloseTrigger disabled={loading} aria-label={t("close")} />
        <DialogBody px={6} py={isRename ? 5 : 6}>
          {isRename ? (
            <Box
              as="form"
              id="rename-concept-note"
              onSubmit={(event) => void rename(event)}
            >
              <Field
                label={t("concept-note-name")}
                invalid={Boolean(error)}
                errorText={error}
              >
                <Input
                  ref={inputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  borderColor="border.neutral"
                  bg="base.light"
                />
              </Field>
            </Box>
          ) : (
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
                <Icon as={LuTrash2} boxSize={5} />
              </Box>
              <Text color="content.primary">
                {t("delete-dialog-description", { name: run.name })}
              </Text>
              <Text fontSize="body.sm" color="content.tertiary">
                {t("delete-dialog-retention")}
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
          )}
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
            disabled={loading}
          >
            {t("cancel")}
          </Button>
          {isRename ? (
            <Button
              type="submit"
              form="rename-concept-note"
              loading={loading}
              disabled={!name.trim() || name.trim() === run.name}
            >
              {t("save-name")}
            </Button>
          ) : (
            <Button
              bg="sentiment.negativeDefault"
              color="base.light"
              loading={loading}
              onClick={() => void remove()}
            >
              {t("delete-permanently")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
