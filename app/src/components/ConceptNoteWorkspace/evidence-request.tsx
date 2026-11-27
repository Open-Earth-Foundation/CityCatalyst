"use client";

import { useState } from "react";
import { Box, HStack, Input, Text, Textarea, VStack } from "@chakra-ui/react";
import { Field } from "@/components/ui/field";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/client";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type {
  DocumentWorkspaceNeed,
  DocumentWorkspacePoint,
} from "@/util/document-workspace";
import { ReviewButton as Button } from "./review-button";

/** Staff can copy the request, then record whom they actually asked. */
export function EvidenceRequest({
  need,
  points,
  runId,
  lng,
}: {
  need: DocumentWorkspaceNeed;
  points: DocumentWorkspacePoint[];
  runId: string;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [selectedKey, setSelectedKey] = useState("");
  const point = points.find((item) => item.key === selectedKey) ?? points[0];
  const suggestedHolder = need.holder || t("workspace-usual-records-holder");
  const request =
    need.guidance?.replace(/^Ask for /i, "Please include ") || need.description;
  const suggestedNote = t("workspace-request-template", {
    document: point?.usual_document || need.label,
    request,
    point: point?.label || need.label,
  });
  const [editedNote, setEditedNote] = useState<string | null>(null);
  const note = editedNote ?? suggestedNote;
  const [holder, setHolder] = useState(suggestedHolder);
  const [copyState, setCopyState] = useState<"copied" | "manual" | null>(null);
  const [command, state] =
    documentWorkspaceApi.useCommandDocumentPointMutation();
  const savedPoint = state.data?.point;
  const task =
    point &&
    savedPoint &&
    savedPoint.point_id === point.point_id &&
    savedPoint.version > point.version
      ? savedPoint.task
      : point?.task;
  const waiting = task?.status === "waiting";
  return (
    <Box
      as="details"
      mt={2}
      borderLeft="2px solid"
      borderColor="border.neutral"
      pl={3}
    >
      <Text
        as="summary"
        cursor="pointer"
        fontWeight="medium"
        fontSize="body.sm"
        color="content.link"
      >
        {t("workspace-find-evidence")}
      </Text>
      <VStack align="stretch" gap={3} mt={3}>
        <Text fontSize="body.sm">
          {t("workspace-usual-holder", { holder: suggestedHolder })}
        </Text>
        <Text fontSize="body.sm">{need.guidance || need.description}</Text>
        {points.length > 1 && (
          <Field label={t("workspace-follow-up-point")}>
            <NativeSelectRoot>
              <NativeSelectField
                value={point?.key ?? ""}
                onChange={(event) => {
                  setSelectedKey(event.target.value);
                  setEditedNote(null);
                  setCopyState(null);
                  state.reset();
                }}
              >
                {points.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
          </Field>
        )}
        <Field label={t("workspace-request-note")}>
          <Textarea
            rows={4}
            value={note}
            onChange={(event) => {
              setEditedNote(event.target.value);
              setCopyState(null);
            }}
          />
        </Field>
        <HStack flexWrap="wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={!note.trim()}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(note);
                setCopyState("copied");
              } catch {
                setCopyState("manual");
              }
            }}
          >
            {t("workspace-copy-note")}
          </Button>
          {copyState && (
            <Text role="status" fontSize="body.sm">
              {t(
                copyState === "copied"
                  ? "workspace-note-copied"
                  : "workspace-copy-manually",
              )}
            </Text>
          )}
        </HStack>
        {point &&
          (waiting ? (
            <Text role="status" fontSize="body.sm">
              {t("workspace-waiting-for-value", {
                name: task?.waiting_for || holder,
              })}
            </Text>
          ) : (
            <Field
              label={t("workspace-request-recipient")}
              helperText={t("workspace-request-follow-up-help")}
            >
              <Input
                value={holder}
                maxLength={1000}
                onChange={(event) => setHolder(event.target.value)}
              />
              <Button
                size="sm"
                mt={2}
                loading={state.isLoading}
                disabled={!holder.trim() || !note.trim() || note.length > 4000}
                onClick={() =>
                  void command({
                    runId,
                    pointKey: point.key,
                    command: {
                      command: "park",
                      expected_version: point.version,
                      idempotency_key: crypto.randomUUID(),
                      waiting_for: holder.trim(),
                      requested_information: note.trim(),
                    },
                  })
                }
              >
                {t("workspace-mark-waiting")}
              </Button>
            </Field>
          ))}
        {state.isError && (
          <Text role="alert" fontSize="body.sm">
            {t("workspace-command-error")}
          </Text>
        )}
      </VStack>
    </Box>
  );
}
