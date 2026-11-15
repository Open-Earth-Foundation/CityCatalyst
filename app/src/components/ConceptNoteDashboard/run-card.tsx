import { Flex, Heading, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { motion } from "framer-motion";
import type { TFunction } from "i18next";
import NextLink from "next/link";
import { LuEllipsis } from "react-icons/lu";
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@/components/ui/menu";

import { ReviewButton as Button } from "../ConceptNoteWorkspace/review-button";
import { api } from "@/services/api";
import { hasIncompleteInitialUploads } from "@/util/concept-note-initial-uploads";
import type { ConceptNoteRun } from "@/util/types";

import { StatusBadge } from "./status-badge";
import { getRunClimateActionPlanState } from "./climate-action-plan-status";
import {
  contextSourceStatusKey,
  contextSourceTone,
} from "./context-source-status";
import { ContextStatusBadge } from "../ConceptNoteWorkspace/context-status-badge";
import {
  getConceptNoteStatusPresentation,
  hasConceptNoteDraftContent,
  shouldLoadConceptNoteReviewStatus,
} from "./utils";

interface RunCardProps {
  activityLabel: string;
  duplicateLoading: boolean;
  lifecycleDisabled: boolean;
  onRetryUpload: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onRename: () => void;
  reducedMotion: boolean;
  resumeHref: string;
  run: ConceptNoteRun;
  scopeLabel: string;
  t: TFunction;
  uploading: boolean;
}

export function RunCard({
  activityLabel,
  duplicateLoading,
  lifecycleDisabled,
  onRetryUpload,
  onDelete,
  onDuplicate,
  onExport,
  onRename,
  reducedMotion,
  resumeHref,
  run,
  scopeLabel,
  t,
  uploading,
}: RunCardProps) {
  const incomplete = !uploading && hasIncompleteInitialUploads(run);
  const loadReviewStatus = shouldLoadConceptNoteReviewStatus(
    run.status,
    run.progress_summary,
  );
  const { currentData: draft } = api.useGetConceptNoteDraftQuery(run.run_id, {
    skip: !loadReviewStatus,
  });
  const status = getConceptNoteStatusPresentation(run.status, draft);
  const planState = getRunClimateActionPlanState(run);

  const hasDraft = hasConceptNoteDraftContent(run.progress_summary, draft);
  const showStatus =
    uploading || incomplete || status.translationKey !== "status-in-progress";
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <Flex
        as="article"
        data-testid={`concept-note-run-${run.run_id}`}
        direction={{ base: "column", md: "row" }}
        align={{ base: "stretch", md: "center" }}
        gap={3}
        p={4}
        borderBottom="1px solid"
        borderColor="border.neutral"
        bg="base.light"
      >
        <VStack flex={1} minW={0} align="stretch" gap={1}>
          <HStack gap={3} flexWrap="wrap">
            <Heading
              as="h2"
              fontSize="body.lg"
              color="content.primary"
              overflowWrap="anywhere"
            >
              {run.name}
            </Heading>
            {showStatus && (
              <StatusBadge
                label={t(
                  uploading
                    ? "uploading-sources"
                    : incomplete
                      ? "upload-incomplete"
                      : status.translationKey,
                )}
                tone={uploading ? "info" : incomplete ? "warning" : status.tone}
              />
            )}
          </HStack>
          <Text fontSize="body.sm" color="content.secondary">
            {scopeLabel}
          </Text>
          <Text fontSize="body.sm" color="content.tertiary">
            {incomplete ? t("upload-incomplete-message") : activityLabel}
          </Text>
          {planState && (
            <HStack gap={2}>
              <Text fontSize="body.sm" color="content.secondary">
                {t("hiap-context")}
              </Text>
              <ContextStatusBadge
                label={t(contextSourceStatusKey(planState))}
                tone={contextSourceTone(planState)}
              />
            </HStack>
          )}
        </VStack>
        <HStack flexShrink={0} gap={2}>
          {incomplete ? (
            <Button size="sm" onClick={onRetryUpload}>
              {t("retry-upload")}
            </Button>
          ) : (
            <Button asChild size="sm">
              <NextLink
                href={resumeHref}
                aria-label={`${t("resume")}: ${run.name}`}
              >
                {t("resume")}
              </NextLink>
            </Button>
          )}
          {!incomplete && (
            <Button
              size="sm"
              variant="outline"
              disabled={lifecycleDisabled || !hasDraft}
              title={!hasDraft ? t("workspace-export-needs-draft") : undefined}
              onClick={onExport}
              aria-label={`${t("export")}: ${run.name}`}
            >
              {t("export")}
            </Button>
          )}
          <MenuRoot>
            <MenuTrigger asChild>
              <Button
                size="sm"
                variant="plain"
                aria-label={`${t("workspace-more-actions")}: ${run.name}`}
                disabled={lifecycleDisabled || duplicateLoading}
              >
                <Icon as={LuEllipsis} />
              </Button>
            </MenuTrigger>
            <MenuContent bg="base.light" borderColor="border.neutral">
              <MenuItem value="rename" onClick={onRename}>
                {t("rename")}
              </MenuItem>
              {!incomplete && (
                <MenuItem value="duplicate" onClick={onDuplicate}>
                  {t("duplicate")}
                </MenuItem>
              )}
              <MenuItem
                value="delete"
                color="sentiment.negativeDefault"
                onClick={onDelete}
              >
                {t("delete")}
              </MenuItem>
            </MenuContent>
          </MenuRoot>
        </HStack>
      </Flex>
    </motion.div>
  );
}
