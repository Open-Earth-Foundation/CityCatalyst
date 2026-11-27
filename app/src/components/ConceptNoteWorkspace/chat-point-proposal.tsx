"use client";

import { useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type { ChatPointProposal } from "./chat-utils";
import { pointValueText } from "./point-state";
import { ReviewButton as Button } from "./review-button";
import { documentWorkspaceErrorKind } from "./workspace-errors";

export function ChatPointProposalCard({
  proposal,
  runId,
  lng,
}: {
  proposal: ChatPointProposal;
  runId: string;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const { command } = proposal;
  const [apply, state] = documentWorkspaceApi.useCommandDocumentPointMutation({
    fixedCacheKey: command.idempotency_key,
  });
  const [dismissed, setDismissed] = useState(false);
  const value = pointValueText(
    proposal.candidate_value ?? command.value ?? null,
  );
  const stale = documentWorkspaceErrorKind(state.error) === "stale";
  return (
    <VStack
      align="stretch"
      gap={2}
      p={3}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
    >
      <Text fontSize="label.sm" color="content.secondary">
        {t("workspace-review-proposed-action")}
      </Text>
      <Text fontWeight="semibold">{proposal.label}</Text>
      <Text fontSize="body.sm">
        {t(`workspace-operation-${command.command}`)}
        {value && ` · ${value}`}
      </Text>
      {command.reason && <Text fontSize="body.sm">{command.reason}</Text>}
      {command.waiting_for && (
        <Text fontSize="body.sm">
          {t("workspace-waiting-for-value", { name: command.waiting_for })}
        </Text>
      )}
      {command.requested_information && (
        <Text fontSize="body.sm">{command.requested_information}</Text>
      )}
      {proposal.citations.map((cite, index) => (
        <Box
          key={index}
          borderLeft="2px solid"
          borderColor="border.neutral"
          pl={2}
        >
          <Text fontSize="body.sm">{cite.quote}</Text>
          <Text color="content.secondary" fontSize="body.sm">
            {cite.source_label}
            {cite.page_number != null &&
              ` · ${t("workspace-page", { page: cite.page_number })}`}
          </Text>
        </Box>
      ))}
      {state.isSuccess || dismissed ? (
        <Text fontSize="body.sm" role="status">
          {t(
            state.isSuccess
              ? "workspace-change-saved"
              : "workspace-proposal-dismissed",
          )}
        </Text>
      ) : (
        <HStack>
          <Button
            size="sm"
            loading={state.isLoading}
            disabled={stale}
            onClick={() =>
              void apply({ runId, pointKey: proposal.point_key, command })
            }
          >
            {t("workspace-save-change")}
          </Button>
          <Button
            size="sm"
            variant="plain"
            disabled={state.isLoading}
            onClick={() => setDismissed(true)}
          >
            {t("cancel")}
          </Button>
        </HStack>
      )}
      {state.isError && (
        <Text role="alert" fontSize="body.sm">
          {t(stale ? "workspace-proposal-stale" : "workspace-command-error")}
        </Text>
      )}
    </VStack>
  );
}
