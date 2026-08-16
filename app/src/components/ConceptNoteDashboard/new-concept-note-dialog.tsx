"use client";

import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useRef, useState } from "react";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import {
  LuBuilding2,
  LuFilePlus2,
  LuFileText,
  LuInfo,
  LuLandmark,
  LuUpload,
  LuX,
} from "react-icons/lu";

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
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";

import {
  formatFileSize,
  validateConceptNotePdf,
} from "../ConceptNoteWiringHarness/utils";

interface NewConceptNoteDialogProps {
  cityId: string;
  cityName: string;
  lng: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string | null;
  projectName?: string | null;
}

function defaultConceptNoteName(locale: string, label: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  return `${label} · ${date}`;
}

export function NewConceptNoteDialog({
  cityId,
  cityName,
  lng,
  onOpenChange,
  open,
  projectId,
  projectName,
}: NewConceptNoteDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const createdRunIdRef = useRef<string | null>(null);
  const latestUploadIdRef = useRef<string | null>(null);
  const uploadedFileIdentitiesRef = useRef(new Set<string>());
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startRun, startState] = api.useStartConceptNoteRunMutation();
  const [uploadPdf, uploadState] = api.useUploadConceptNotePdfMutation();

  const isBusy = startState.isLoading || uploadState.isLoading;
  const optionalText = (
    <Text
      as="span"
      ms={1}
      fontSize="label.sm"
      fontWeight="normal"
      color="content.tertiary"
    >
      · {t("optional")}
    </Text>
  );

  async function addFiles(selectedFiles: File[]): Promise<void> {
    setError(null);
    const validated: File[] = [];
    for (const file of selectedFiles) {
      const validationError = await validateConceptNotePdf(file);
      if (validationError) {
        setError(t(validationError));
        return;
      }
      validated.push(file);
    }
    setFiles((current) => {
      const identities = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      );
      return [
        ...current,
        ...validated.filter(
          (file) =>
            !identities.has(`${file.name}:${file.size}:${file.lastModified}`),
        ),
      ];
    });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function closeDialog(): void {
    if (isBusy) {
      return;
    }
    resetDraft();
    onOpenChange(false);
  }

  function resetDraft(): void {
    setName("");
    setFiles([]);
    setIsDragging(false);
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
    createdRunIdRef.current = null;
    latestUploadIdRef.current = null;
    uploadedFileIdentitiesRef.current.clear();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    try {
      let targetRunId = createdRunIdRef.current;
      if (!targetRunId) {
        const run = await startRun({
          cityId,
          idempotencyKey: idempotencyKeyRef.current,
          name:
            name.trim() ||
            defaultConceptNoteName(lng, t("untitled-concept-note")),
          projectId: projectId ?? null,
        }).unwrap();
        targetRunId = run.run_id;
        createdRunIdRef.current = targetRunId;
      }

      for (const file of files) {
        const identity = `${file.name}:${file.size}:${file.lastModified}`;
        if (uploadedFileIdentitiesRef.current.has(identity)) {
          continue;
        }
        const formData = new FormData();
        formData.set("file", file);
        formData.set("sourceLabel", file.name.replace(/\.pdf$/i, ""));
        const upload = await uploadPdf({
          cityId,
          formData,
          runId: targetRunId,
        }).unwrap();
        uploadedFileIdentitiesRef.current.add(identity);
        latestUploadIdRef.current = upload.uploadId;
      }

      const latestUploadId = latestUploadIdRef.current;
      const query = latestUploadId
        ? `?${new URLSearchParams({ uploadId: latestUploadId })}`
        : "";
      router.push(
        `/${lng}/cities/${cityId}/concept-notes/${targetRunId}${query}`,
      );
      resetDraft();
      onOpenChange(false);
    } catch {
      setError(t("create-note-error"));
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => {
        if (!details.open) {
          closeDialog();
        }
      }}
      closeOnEscape={!isBusy}
      closeOnInteractOutside={!isBusy}
      size="lg"
    >
      <DialogContent
        maxW="640px"
        maxH="calc(100dvh - 32px)"
        my={4}
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <Box
          as="form"
          display="flex"
          flexDirection="column"
          minH={0}
          maxH="calc(100dvh - 32px)"
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader
            display="block"
            borderBottom="1px solid"
            borderColor="border.neutral"
            px={6}
            py={5}
            pe={12}
          >
            <DialogTitle
              fontFamily="heading"
              fontSize="title.lg"
              color="content.primary"
            >
              {t("create-dialog-title")}
            </DialogTitle>
            <Text mt={1} fontSize="body.sm" color="content.tertiary">
              {t("create-dialog-description")}
            </Text>
          </DialogHeader>
          <DialogCloseTrigger disabled={isBusy} aria-label={t("close")} />

          <DialogBody minH={0} overflowY="auto" px={6} py={5}>
            <VStack align="stretch" gap={5}>
              <Field
                width="full"
                label={t("application-name")}
                optionalText={optionalText}
                helperText={t("application-name-help")}
              >
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  placeholder={t("application-name-placeholder")}
                  borderColor="border.neutral"
                  bg="base.light"
                />
              </Field>

              <Flex gap={3} direction={{ base: "column", sm: "row" }}>
                <VStack
                  align="stretch"
                  gap={1}
                  flex={1}
                  border="1px solid"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                  bg="background.alternativeLight"
                  p={3}
                >
                  <HStack gap={2} color="content.link">
                    <Icon as={LuBuilding2} />
                    <Text fontSize="label.sm" fontWeight="semibold">
                      {t("city")}
                    </Text>
                  </HStack>
                  <Text
                    fontFamily="heading"
                    fontSize="body.sm"
                    color="content.primary"
                  >
                    {cityName}
                  </Text>
                  <Text fontSize="label.sm" color="content.tertiary">
                    {t("derived-from-page")}
                  </Text>
                </VStack>
                <VStack
                  align="stretch"
                  gap={1}
                  flex={1}
                  border="1px solid"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                  bg="background.alternativeLight"
                  p={3}
                >
                  <HStack gap={2} color="content.link">
                    <Icon as={LuLandmark} />
                    <Text fontSize="label.sm" fontWeight="semibold">
                      {t("city-project")}
                    </Text>
                  </HStack>
                  <Text
                    fontFamily="heading"
                    fontSize="body.sm"
                    color="content.primary"
                  >
                    {projectName || t("no-project-linked")}
                  </Text>
                  <Text fontSize="label.sm" color="content.tertiary">
                    {projectId ? t("linked-automatically") : t("optional")}
                  </Text>
                </VStack>
              </Flex>

              <Flex gap={4} direction={{ base: "column", sm: "row" }}>
                <Field
                  flex={1}
                  label={t("funder")}
                  optionalText={optionalText}
                >
                  <NativeSelectRoot width="full" disabled>
                    <NativeSelectField>
                      <option>{t("choose-later-in-chat")}</option>
                    </NativeSelectField>
                  </NativeSelectRoot>
                </Field>
                <Field
                  flex={1}
                  label={t("funding-opportunity")}
                  optionalText={optionalText}
                >
                  <NativeSelectRoot width="full" disabled>
                    <NativeSelectField>
                      <option>{t("choose-later-in-chat")}</option>
                    </NativeSelectField>
                  </NativeSelectRoot>
                </Field>
              </Flex>

              <Box
                border="1px solid"
                borderColor="border.neutral"
                borderRadius="rounded"
                bg="background.neutral"
                px={3}
                py={2.5}
              >
                <HStack align="start" gap={2} color="content.link">
                  <Icon as={LuInfo} mt={0.5} />
                  <Text fontSize="label.sm" color="content.secondary">
                    {t("funder-backend-note")}
                  </Text>
                </HStack>
              </Box>

              <Field
                width="full"
                label={t("supporting-pdfs")}
                optionalText={optionalText}
                helperText={t("supporting-pdfs-help")}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  hidden
                  onChange={onFileChange}
                />
                <Flex
                  width="full"
                  minH="116px"
                  align="center"
                  justify="center"
                  direction="column"
                  gap={2}
                  border="1px dashed"
                  borderColor={isDragging ? "content.link" : "border.neutral"}
                  borderRadius="rounded"
                  bg={isDragging ? "background.alternativeLight" : "base.light"}
                  cursor="pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <Icon as={LuUpload} boxSize={5} color="content.link" />
                  <Text
                    fontSize="body.sm"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("drop-pdfs")}
                  </Text>
                  <Text fontSize="label.sm" color="content.tertiary">
                    {t("pdf-limit")}
                  </Text>
                </Flex>
              </Field>

              {files.length > 0 && (
                <VStack align="stretch" gap={2}>
                  {files.map((file) => (
                    <Flex
                      key={`${file.name}:${file.size}:${file.lastModified}`}
                      align="center"
                      gap={3}
                      border="1px solid"
                      borderColor="border.neutral"
                      borderRadius="rounded"
                      px={3}
                      py={2}
                    >
                      <Icon as={LuFileText} color="content.link" />
                      <Box minW={0} flex={1}>
                        <Text
                          truncate
                          fontSize="body.sm"
                          color="content.primary"
                        >
                          {file.name}
                        </Text>
                        <Text fontSize="label.sm" color="content.tertiary">
                          {formatFileSize(file.size)}
                        </Text>
                      </Box>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        color="content.link"
                        _hover={{ color: "content.link" }}
                        aria-label={t("remove-file", { name: file.name })}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((candidate) => candidate !== file),
                          )
                        }
                      >
                        <Icon as={LuX} />
                      </Button>
                    </Flex>
                  ))}
                  <Button
                    type="button"
                    alignSelf="start"
                    size="xs"
                    variant="ghost"
                    color="content.link"
                    _hover={{ color: "content.link" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon as={LuFilePlus2} />
                    {t("add-another-pdf")}
                  </Button>
                </VStack>
              )}

              {error && (
                <Box
                  role="alert"
                  border="1px solid"
                  borderColor="sentiment.negativeDefault"
                  borderRadius="rounded"
                  bg="sentiment.negativeOverlay"
                  p={3}
                >
                  <Text fontSize="body.sm" color="content.primary">
                    {error}
                  </Text>
                </Box>
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
              type="button"
              variant="ghost"
              color="content.link"
              _hover={{ color: "content.link" }}
              onClick={closeDialog}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant="solid"
              loading={isBusy}
              loadingText={
                startState.isLoading
                  ? t("creating-workspace")
                  : t("uploading-sources")
              }
            >
              {t("create-and-open")}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </DialogRoot>
  );
}
