"use client";

import { useState } from "react";
import { Box, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { ReviewButton as Button } from "./review-button";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/client";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type { DocumentWorkspace } from "@/util/document-workspace";

export function WorkspaceSources({
  runId,
  lng,
  workspace,
  onAttached,
  onAddSource,
  onSelectPoint,
  sourceBusy = false,
}: {
  runId: string;
  lng: string;
  workspace?: DocumentWorkspace;
  onAttached: () => void;
  onAddSource: () => void;
  onSelectPoint: (key: string) => void;
  sourceBusy?: boolean;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [role, setRole] = useState<"reference" | "climate_action_plan">(
    "reference",
  );
  const documents = documentWorkspaceApi.useGetWorkspaceDocumentsQuery(
    { runId, offset },
    { skip: !open, refetchOnMountOrArgChange: true },
  );
  const [attach, attachState] =
    documentWorkspaceApi.useAttachWorkspaceDocumentMutation();
  const [attached, setAttached] = useState(false);
  return (
    <VStack
      align="stretch"
      gap={3}
      p={{ base: 4, md: 5 }}
      borderBottom="1px solid"
      borderColor="border.neutral"
    >
      <HStack justify="space-between" flexWrap="wrap">
        <Heading as="h2" fontSize="title.md">
          {t("workspace-evidence-needs")}
        </Heading>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setAttached(false);
            setOpen(true);
          }}
        >
          {t("workspace-use-existing-source")}
        </Button>
      </HStack>
      {workspace?.needs.map((need) => (
        <Box
          key={need.need_id}
          py={3}
          borderTop="1px solid"
          borderColor="border.neutral"
        >
          <HStack justify="space-between">
            <Text fontSize="body.md" fontWeight="semibold">
              {need.label}
            </Text>
            <Text fontSize="label.sm" color="content.tertiary">
              {t(need.required ? "workspace-required" : "workspace-optional")}
            </Text>
          </HStack>
          <Text mt={1} fontSize="body.sm" color="content.secondary">
            {need.description}
          </Text>
          <Text mt={2} fontSize="label.sm" color="content.link">
            {t(`workspace-need-${need.status}`)}
          </Text>
          {need.guidance && (
            <Box as="details" mt={2}>
              <Text
                as="summary"
                cursor="pointer"
                fontSize="body.sm"
                color="content.link"
              >
                {t("workspace-evidence-guidance")}
              </Text>
              <Text mt={2} fontSize="body.sm" lineHeight={1.6}>
                {need.guidance}
              </Text>
            </Box>
          )}
          {need.documents.map((document) => (
            <Text key={document.upload_id} mt={2} fontSize="body.sm">
              {document.filename} ·{" "}
              {t(
                document.ready
                  ? "workspace-source-ready"
                  : "workspace-source-processing",
              )}
            </Text>
          ))}
          <HStack mt={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={onAddSource}
              disabled={sourceBusy}
            >
              {t(
                sourceBusy
                  ? "workspace-evidence-uploading"
                  : "workspace-add-evidence",
              )}
            </Button>
            {need.point_keys.map((key) => (
              <Button
                key={key}
                size="sm"
                variant="plain"
                onClick={() => onSelectPoint(key)}
              >
                {workspace.points.find((point) => point.key === key)?.label ??
                  key}
              </Button>
            ))}
          </HStack>
        </Box>
      ))}
      {attached && (
        <Text role="status" color="content.link">
          {t("workspace-source-attached")}
        </Text>
      )}
      <DialogRoot open={open} onOpenChange={({ open: next }) => setOpen(next)}>
        <DialogContent
          maxH="calc(100dvh - 32px)"
          display="flex"
          flexDirection="column"
        >
          <DialogHeader>
            <DialogTitle>{t("workspace-use-existing-source")}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger aria-label={t("close")} />
          <DialogBody pb={6} minH={0} overflowY="auto">
            <Text mb={4} color="content.secondary">
              {t("workspace-source-picker-help")}
            </Text>
            <NativeSelectRoot mb={4}>
              <NativeSelectField
                aria-label={t("workspace-source-role")}
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                <option value="reference">
                  {t("workspace-source-reference")}
                </option>
                <option value="climate_action_plan">{t("hiap-context")}</option>
              </NativeSelectField>
            </NativeSelectRoot>
            {documents.isFetching && (
              <Text role="status">{t("workspace-loading")}</Text>
            )}
            {documents.isError && (
              <Box role="alert">
                <Text>{t("workspace-sources-error")}</Text>
                <Button
                  mt={2}
                  size="sm"
                  variant="outline"
                  onClick={() => void documents.refetch()}
                >
                  {t("retry")}
                </Button>
              </Box>
            )}
            {!documents.isFetching && documents.data?.data.length === 0 && (
              <Text>{t("workspace-no-existing-sources")}</Text>
            )}
            <VStack align="stretch" gap={2}>
              {documents.data?.data.map((document) => (
                <HStack
                  key={document.documentId}
                  p={3}
                  border="1px solid"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                >
                  <Box flex={1} minW={0}>
                    <Text overflowWrap="anywhere">{document.filename}</Text>
                    <Text fontSize="label.sm" color="content.tertiary">
                      {document.sourceFormat.toUpperCase()} ·{" "}
                      {t(
                        document.markdownReady
                          ? "workspace-source-ready"
                          : "workspace-source-processing",
                      )}
                    </Text>
                  </Box>
                  <Button
                    size="sm"
                    loading={attachState.isLoading}
                    onClick={async () => {
                      try {
                        await attach({
                          runId,
                          document_id: document.documentId,
                          source_role: role,
                        }).unwrap();
                        setAttached(true);
                        setOpen(false);
                        onAttached();
                      } catch {
                        /* State below offers retry. */
                      }
                    }}
                  >
                    {t("workspace-attach-source")}
                  </Button>
                </HStack>
              ))}
            </VStack>
            {attachState.isError && (
              <Text mt={3} role="alert" color="sentiment.negativeDefault">
                {t("workspace-attach-error")}
              </Text>
            )}
            <HStack justify="space-between" mt={4}>
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || documents.isFetching}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                {t("workspace-previous")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !documents.data?.pagination.hasMore || documents.isFetching
                }
                onClick={() => setOffset(offset + 20)}
              >
                {t("workspace-next")}
              </Button>
            </HStack>
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    </VStack>
  );
}
