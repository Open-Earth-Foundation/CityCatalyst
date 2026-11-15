"use client";

import { Box, Text } from "@chakra-ui/react";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type { ConceptNoteUploadResponse } from "@/util/types";

export function UploadSharingButton({
  upload,
  runId,
  lng,
}: {
  upload: ConceptNoteUploadResponse;
  runId: string;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const status = api.useGetConceptNoteUploadStatusQuery(
    { runId, uploadId: upload.uploadId },
    {
      skip: Boolean(upload.documentId && upload.visibility),
      refetchOnMountOrArgChange: true,
    },
  );
  const [share, state] =
    documentWorkspaceApi.useShareWorkspaceDocumentMutation();
  const documentId = upload.documentId ?? status.currentData?.documentId;
  const visibility =
    state.data?.data.visibility ??
    status.currentData?.visibility ??
    upload.visibility;
  if (!documentId || !visibility) return null;
  if (visibility === "city")
    return (
      <Text fontSize="label.sm" color="content.secondary">
        {t("workspace-source-city-shared")}
      </Text>
    );
  return (
    <Box>
      <Button
        size="xs"
        variant="outline"
        loading={state.isLoading}
        aria-label={t("workspace-share-source-name", {
          filename:
            upload.filename ?? upload.sourceLabel ?? t("recent-run-upload"),
        })}
        onClick={() =>
          void share({ runId, uploadId: upload.uploadId, documentId })
        }
      >
        {t("workspace-share-source")}
      </Button>
      {state.isError && (
        <Text
          mt={1}
          role="alert"
          fontSize="label.sm"
          color="sentiment.negativeDefault"
        >
          {t("workspace-share-source-error")}
        </Text>
      )}
    </Box>
  );
}
