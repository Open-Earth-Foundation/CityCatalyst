"use client";

import { Box, Grid, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type { DocumentWorkspace } from "@/util/document-workspace";
import type { ConceptNoteDraftChapter } from "@/util/types";
import { DocumentPointCard } from "./document-point-card";
import { pointGroup, pointGroups, pointValueText } from "./point-state";

interface PanelProps {
  workspace: DocumentWorkspace;
  lng: string;
  onSelectPoint: (key: string) => void;
}

export function WorkspaceOverview({
  workspace,
  lng,
  onSelectPoint,
  chapters,
  onOpenDraft,
}: PanelProps & {
  chapters: ConceptNoteDraftChapter[];
  onOpenDraft: () => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const { overview } = workspace;
  const covered = workspace.points.filter((point) =>
    ["answered", "assumption", "not_applicable"].includes(point.status),
  );
  const waiting = workspace.points.filter(
    (point) => pointGroup(point) === "waiting",
  );
  return (
    <VStack align="stretch" gap={6} p={{ base: 4, md: 6 }}>
      <Box>
        <Heading size="md">{t("workspace-overview-title")}</Heading>
        <Text mt={1} color="content.secondary">
          {t("workspace-overview-help")}
        </Text>
      </Box>
      <Grid gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={3}>
        {(["required", "optional"] as const).map((kind) => (
          <Box
            key={kind}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            p={4}
            bg="background.alternativeLight"
          >
            <Text fontSize="label.sm" color="content.secondary">
              {t(`workspace-${kind}`)}
            </Text>
            <Text fontFamily="heading" fontSize="title.lg" color="content.link">
              {t("workspace-coverage-count", {
                covered: overview[`${kind}_covered`],
                total: overview[`${kind}_total`],
              })}
            </Text>
          </Box>
        ))}
      </Grid>
      <Box>
        <Heading size="sm" mb={3}>
          {t("workspace-next-steps")}
        </Heading>
        <VStack align="stretch" gap={2}>
          {overview.next_steps.slice(0, 3).map((step) => {
            const point = workspace.points.find(
              (item) => item.point_id === step.point_id,
            );
            return (
              <Button
                key={step.point_id}
                variant="outline"
                h="auto"
                py={3}
                justifyContent="start"
                whiteSpace="normal"
                textAlign="left"
                disabled={!point}
                onClick={() => point && onSelectPoint(point.key)}
              >
                <Box>
                  <Text fontWeight="semibold">{step.label}</Text>
                  <Text fontSize="label.sm" fontWeight="normal" mt={1}>
                    {step.reason}
                  </Text>
                </Box>
              </Button>
            );
          })}
          {!overview.next_steps.length && (
            <Text color="content.secondary">
              {t("workspace-no-next-steps")}
            </Text>
          )}
        </VStack>
      </Box>
      <Box>
        <Heading size="sm" mb={3}>
          {t("workspace-known-facts")}
        </Heading>
        <VStack align="stretch" gap={3}>
          {covered.slice(0, 6).map((point) => (
            <Box
              key={point.key}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              p={3}
            >
              <Button
                variant="plain"
                h="auto"
                p={0}
                whiteSpace="normal"
                textAlign="left"
                onClick={() => onSelectPoint(point.key)}
              >
                {point.label}
              </Button>
              <Text mt={1} whiteSpace="pre-wrap">
                {pointValueText(point.value) ||
                  t(`workspace-point-status-${point.status}`)}
              </Text>
              {point.candidates
                .filter((candidate) => candidate.status === "accepted")
                .flatMap((candidate) => candidate.citations)
                .map((citation, index) => (
                  <Box
                    key={index}
                    mt={2}
                    pl={3}
                    borderLeft="2px solid"
                    borderColor="content.link"
                  >
                    <Text fontSize="body.sm">{citation.quote}</Text>
                    <Text fontSize="label.sm" color="content.tertiary">
                      {citation.source_label}
                      {citation.page_number !== null
                        ? ` · ${t("workspace-page", { page: citation.page_number })}`
                        : ""}
                    </Text>
                  </Box>
                ))}
            </Box>
          ))}
          {!covered.length && (
            <Text color="content.secondary">
              {t("workspace-no-known-facts")}
            </Text>
          )}
        </VStack>
      </Box>
      <Box>
        <Heading size="sm" mb={3}>
          {t("workspace-group-waiting", { count: overview.waiting_count })}
        </Heading>
        {waiting.map((point) => (
          <Box key={point.key} mb={2}>
            <Button
              variant="plain"
              h="auto"
              p={0}
              onClick={() => onSelectPoint(point.key)}
            >
              {point.label}
            </Button>
            <Text fontSize="body.sm" color="content.secondary">
              {point.task?.waiting_for}
              {point.task?.requested_information
                ? ` · ${point.task.requested_information}`
                : ""}
            </Text>
          </Box>
        ))}
        {!waiting.length && (
          <Text color="content.secondary">
            {t("workspace-nothing-waiting")}
          </Text>
        )}
      </Box>
      <Box>
        <HStack justify="space-between" mb={3}>
          <Heading size="sm">{t("workspace-draft-shape")}</Heading>
          <Button size="sm" variant="outline" onClick={onOpenDraft}>
            {t("draft-tab")}
          </Button>
        </HStack>
        <VStack align="stretch" gap={2}>
          {chapters.map((chapter) => {
            const linked = workspace.points.filter(
              (point) =>
                point.chapter_refs.includes(chapter.chapter_id) ||
                (chapter.template_section_id &&
                  point.chapter_refs.includes(chapter.template_section_id)),
            );
            const open = linked.filter(
              (point) => pointGroup(point) !== "covered",
            ).length;
            return (
              <Box
                key={chapter.chapter_id}
                border="1px solid"
                borderColor="border.neutral"
                borderRadius="rounded"
                p={3}
              >
                <Text fontWeight="medium">{chapter.title}</Text>
                <Text fontSize="label.sm" color="content.secondary">
                  {t(
                    chapter.body_markdown
                      ? "workspace-chapter-drafted"
                      : "workspace-chapter-not-drafted",
                  )}
                  {linked.length > 0
                    ? ` · ${t("workspace-open-count", { count: open })}`
                    : ""}
                </Text>
              </Box>
            );
          })}
          {!chapters.length && (
            <Text color="content.secondary">
              {t("workspace-draft-shape-empty")}
            </Text>
          )}
        </VStack>
      </Box>
    </VStack>
  );
}

export function WorkspaceTodos({
  workspace,
  lng,
  onSelectPoint,
  selectedKey,
  runId,
  onAddSource,
  sourceBusy,
}: PanelProps & {
  selectedKey: string | null;
  runId: string;
  onAddSource: () => void;
  sourceBusy?: boolean;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const selected =
    workspace.points.find((point) => point.key === selectedKey) ??
    workspace.points.find((point) => pointGroup(point) !== "covered") ??
    workspace.points[0];
  return (
    <Grid
      gridTemplateColumns={{
        base: "1fr",
        lg: "minmax(180px, 34%) minmax(0, 1fr)",
      }}
      alignItems="start"
      gap={5}
      p={{ base: 4, md: 6 }}
    >
      <VStack
        as="nav"
        aria-label={t("workspace-points-label")}
        align="stretch"
        gap={5}
      >
        {pointGroups.map((group) => {
          const points = workspace.points.filter(
            (point) => pointGroup(point) === group,
          );
          return (
            <Box key={group}>
              <Heading size="xs" color="content.secondary" mb={2}>
                {t(`workspace-group-${group}`, { count: points.length })}
              </Heading>
              <VStack align="stretch" gap={1}>
                {points.map((point) => (
                  <Button
                    key={point.key}
                    variant="plain"
                    h="auto"
                    py={3}
                    px={3}
                    justifyContent="start"
                    whiteSpace="normal"
                    textAlign="left"
                    borderLeft="3px solid"
                    borderColor={
                      selected?.key === point.key
                        ? "content.link"
                        : "transparent"
                    }
                    bg={
                      selected?.key === point.key
                        ? "background.alternativeLight"
                        : "transparent"
                    }
                    aria-current={
                      selected?.key === point.key ? "true" : undefined
                    }
                    onClick={() => onSelectPoint(point.key)}
                  >
                    <Box>
                      <Text>{point.label}</Text>
                      <Text
                        fontSize="label.sm"
                        fontWeight="normal"
                        color="content.tertiary"
                      >
                        {t(
                          point.required
                            ? "workspace-required"
                            : "workspace-optional",
                        )}
                      </Text>
                    </Box>
                  </Button>
                ))}
              </VStack>
            </Box>
          );
        })}
      </VStack>
      {selected ? (
        <DocumentPointCard
          key={selected.point_id}
          point={selected}
          runId={runId}
          lng={lng}
          onAddSource={onAddSource}
          sourceBusy={sourceBusy}
        />
      ) : (
        <Text color="content.secondary">{t("workspace-points-empty")}</Text>
      )}
    </Grid>
  );
}
