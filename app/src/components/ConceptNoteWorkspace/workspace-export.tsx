"use client";

import { useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/client";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type { DocumentWorkspace } from "@/util/document-workspace";
import {
  exportConceptNoteMarkdown,
  type ConceptNoteExportFormat,
} from "./concept-note-export";

export function WorkspaceExport({
  workspace,
  runId,
  noteName,
  lng,
  onReload,
}: {
  workspace: DocumentWorkspace;
  runId: string;
  noteName: string;
  lng: string;
  onReload: () => Promise<unknown>;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [format, setFormat] = useState<ConceptNoteExportFormat>("docx");
  const [exportSnapshot, state] =
    documentWorkspaceApi.useExportDocumentWorkspaceMutation();
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const stale = Boolean(
    state.error && "status" in state.error && state.error.status === 409,
  );
  async function download(mode: "working" | "final") {
    setBuildFailed(false);
    try {
      const snapshot = await exportSnapshot({
        runId,
        mode,
        expected_revision: workspace.revision,
      }).unwrap();
      setBuilding(true);
      await exportConceptNoteMarkdown(
        format,
        noteName,
        snapshot.body_markdown,
        lng,
      );
    } catch {
      setBuildFailed(true);
    } finally {
      setBuilding(false);
    }
  }
  return (
    <VStack
      align="stretch"
      gap={3}
      p={4}
      borderBottom="1px solid"
      borderColor="border.neutral"
      bg="background.alternativeLight"
    >
      <HStack flexWrap="wrap">
        <NativeSelectRoot w="auto">
          <NativeSelectField
            aria-label={t("workspace-export-format")}
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as ConceptNoteExportFormat)
            }
          >
            <option value="docx">{t("export-format-docx")}</option>
            <option value="pdf">{t("export-format-pdf")}</option>
          </NativeSelectField>
        </NativeSelectRoot>
        <Button
          size="sm"
          variant="outline"
          loading={state.isLoading || building}
          disabled={!workspace.export_eligibility.working}
          onClick={() => void download("working")}
        >
          {t("workspace-export-working")}
        </Button>
        <Button
          size="sm"
          loading={state.isLoading || building}
          disabled={!workspace.export_eligibility.final}
          aria-describedby={
            !workspace.export_eligibility.final
              ? "workspace-export-blockers"
              : undefined
          }
          onClick={() => void download("final")}
        >
          {t("workspace-export-final")}
        </Button>
      </HStack>
      <Text fontSize="label.sm" color="content.secondary">
        {t("workspace-working-caveat")}
      </Text>
      {!workspace.export_eligibility.final && (
        <Box id="workspace-export-blockers">
          <Text fontSize="label.sm" fontWeight="medium">
            {t("workspace-final-blocked")}
          </Text>
          {workspace.export_eligibility.blockers.map((blocker, index) => (
            <Text key={index} fontSize="label.sm" color="content.secondary">
              {blocker}
            </Text>
          ))}
        </Box>
      )}
      {state.data?.caveats.map((caveat, index) => (
        <Text key={index} role="status" fontSize="label.sm">
          {caveat}
        </Text>
      ))}
      {(state.isError || buildFailed) && (
        <Text role="alert" color="sentiment.negativeDefault">
          {t(
            state.error && "status" in state.error && state.error.status === 409
              ? "workspace-stale-error"
              : "workspace-export-error",
          )}
        </Text>
      )}
      {stale && (
        <Button
          size="sm"
          variant="outline"
          alignSelf="start"
          loading={reloading}
          onClick={async () => {
            setReloading(true);
            try {
              await onReload();
              state.reset();
              setBuildFailed(false);
            } catch {
              setBuildFailed(true);
            } finally {
              setReloading(false);
            }
          }}
        >
          {t("workspace-reload")}
        </Button>
      )}
    </VStack>
  );
}
