"use client";
import { useState } from "react";
import { Alert, Box, HStack, Text, VStack, chakra } from "@chakra-ui/react";
import { ReviewButton as Button } from "./review-button";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { Field } from "@/components/ui/field";
import { useTranslation } from "@/i18n/client";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type { DocumentWorkspace } from "@/util/document-workspace";
import {
  exportConceptNoteMarkdown,
  type ConceptNoteExportFormat,
} from "./concept-note-export";
import { documentWorkspaceErrorKind } from "./workspace-errors";
export function WorkspaceExport({
  workspace,
  runId,
  noteName,
  lng,
  onReload,
  onReviewEvidence,
}: {
  workspace: DocumentWorkspace;
  runId: string;
  noteName: string;
  lng: string;
  onReload: () => Promise<unknown>;
  onReviewEvidence?: () => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [format, setFormat] = useState<ConceptNoteExportFormat>("docx");
  const [exportSnapshot, state] =
    documentWorkspaceApi.useExportDocumentWorkspaceMutation();
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const errorKind = documentWorkspaceErrorKind(state.error);
  function readiness(message: string) {
    const patterns: [RegExp, string][] = [
      [/^Required point unresolved: (.+)$/, "workspace-export-answer-needed"],
      [/^Conflicting evidence: (.+)$/, "workspace-export-conflict-needed"],
      [
        /^Required chapter review pending: (.+)$/,
        "workspace-export-review-needed",
      ],
      [/^Chapter has no text: (.+)$/, "workspace-export-text-needed"],
    ];
    for (const [pattern, key] of patterns) {
      const match = message.match(pattern);
      if (match) return t(key, { label: match[1] });
    }
    const update = message.match(/^Dependent text is [^:]+: (.+)$/);
    if (update)
      return t("workspace-export-update-needed", { label: update[1] });
    if (message.startsWith("Select and confirm"))
      return t("workspace-setup-needed");
    if (message.startsWith("Generate the document text"))
      return t("workspace-export-create-draft");
    if (message.includes("no recognized point requirements"))
      return t("workspace-template-needs-requirements");
    return message;
  }
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
    <VStack align="stretch" gap={4}>
      <Text fontSize="body.md" lineHeight={1.6} color="content.secondary">
        {t("workspace-export-help")}
      </Text>
      <Field label={t("workspace-export-format")}>
        <NativeSelectRoot maxW="260px">
          <NativeSelectField
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as ConceptNoteExportFormat)
            }
          >
            <option value="docx">{t("export-format-docx")}</option>
            <option value="pdf">{t("export-format-pdf")}</option>
          </NativeSelectField>
        </NativeSelectRoot>
      </Field>
      <HStack flexWrap="wrap" gap={2}>
        <Button
          size="sm"
          variant={workspace.export_eligibility.final ? "outline" : "solid"}
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
      <Text fontSize="body.sm" lineHeight={1.5} color="content.secondary">
        {t("workspace-working-caveat")}
      </Text>
      {!workspace.export_eligibility.final && (
        <chakra.details
          open
          id="workspace-export-blockers"
          borderTop="1px solid"
          borderColor="border.neutral"
          pt={3}
        >
          <Text
            as="summary"
            cursor="pointer"
            fontSize="body.md"
            fontWeight="medium"
          >
            {t("workspace-final-checks-count", {
              count: workspace.export_eligibility.blockers.length,
            })}
          </Text>
          <VStack as="ul" align="stretch" gap={2} ps={5} mt={3}>
            {workspace.export_eligibility.blockers.map((blocker, index) => (
              <Text
                as="li"
                key={index}
                fontSize="body.sm"
                lineHeight={1.6}
                color="content.secondary"
              >
                {readiness(blocker)}
              </Text>
            ))}
          </VStack>
        </chakra.details>
      )}
      {state.data && (
        <Text role="status" fontSize="body.sm" color="content.secondary">
          {t("workspace-export-prepared")}
        </Text>
      )}
      {Boolean(state.data?.caveats.length) && (
        <Box as="details">
          <Text
            as="summary"
            cursor="pointer"
            fontSize="body.sm"
            color="content.link"
          >
            {t("workspace-export-included-notes", {
              count: state.data!.caveats.length,
            })}
          </Text>
          {state.data!.caveats.map((caveat, index) => (
            <Text
              key={index}
              mt={2}
              fontSize="body.sm"
              lineHeight={1.6}
              color="content.secondary"
            >
              {readiness(caveat)}
            </Text>
          ))}
        </Box>
      )}
      {(state.isError || buildFailed) && (
        <Alert.Root
          role="alert"
          status={errorKind === "source_unavailable" ? "warning" : "error"}
        >
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t(
                errorKind === "source_unavailable"
                  ? "workspace-source-unavailable-error"
                  : errorKind === "stale"
                    ? "workspace-stale-error"
                    : "workspace-export-error",
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {errorKind === "source_unavailable" && onReviewEvidence && (
        <Button
          size="sm"
          variant="outline"
          alignSelf="start"
          onClick={onReviewEvidence}
        >
          {t("workspace-review-evidence")}
        </Button>
      )}
      {errorKind === "stale" && (
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
