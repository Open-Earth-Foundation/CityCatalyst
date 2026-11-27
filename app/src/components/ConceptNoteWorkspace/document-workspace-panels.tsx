"use client";
import { useRef, useState } from "react";
import {
  chakra,
  Box,
  Flex,
  Heading,
  HStack,
  Text,
  Input,
  VStack,
} from "@chakra-ui/react";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import type {
  DocumentWorkspace,
  DocumentPointQuestion,
} from "@/util/document-workspace";
import type { ConceptNoteDraftChapter } from "@/util/types";
import { DocumentPointCard } from "./document-point-card";
import { SourceQuotation } from "./source-quotation";
import { groupSourceCitations } from "./source-citations";
import { chapterDisplayTitle } from "./chapter-title";
import {
  currentPointCandidate,
  pointGroup,
  pointGroups,
  pointDisplayValue,
} from "./point-state";
import { chapterGapRows, type ChapterGapRow } from "./chapter-gaps-panel";
import styles from "./workspace.module.css";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
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
  onOpenSetup,
  onSyncSetup,
  onOpenExport,
  hasTemplate,
  setupSaving,
  setupError,
  onOpenGap,
  reviewPending,
  onViewChanges,
}: PanelProps & {
  chapters: ConceptNoteDraftChapter[];
  onOpenDraft: () => void;
  onOpenSetup?: () => void;
  onSyncSetup?: (documentType?: string) => void;
  onOpenExport?: () => void;
  hasTemplate?: boolean;
  setupSaving?: boolean;
  setupError?: boolean;
  onOpenGap?: (chapter: ConceptNoteDraftChapter, row: ChapterGapRow) => void;
  reviewPending?: boolean;
  onViewChanges?: () => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const { overview } = workspace;
  const [selectedSetup, setSelectedSetup] = useState("");
  const availableSetups = workspace.available_setups ?? [];
  const chosenSetup = availableSetups.find(
    (setup) => setup.document_type === selectedSetup,
  );
  const covered = workspace.points.filter((point) =>
    ["answered", "assumption", "not_applicable"].includes(point.status),
  );
  const requiredFacts = covered.filter((point) => point.required);
  const optionalFacts = covered.filter((point) => !point.required);
  const gapEntries = chapters.flatMap((chapter) =>
    chapterGapRows(chapter).map((row) => ({ chapter, row })),
  );
  const waiting = workspace.points.filter(
    (point) => pointGroup(point) === "waiting",
  );
  const next = overview.next_steps
    .map((step) =>
      workspace.points.find((point) => point.point_id === step.point_id),
    )
    .filter((point) => point !== undefined)
    .slice(0, 3);
  const setupPicker = availableSetups.length > 0 && (
    <VStack align="stretch" gap={2} w="full">
      <chakra.label htmlFor="workspace-programme" fontWeight="medium">
        {t("workspace-programme")}
      </chakra.label>
      <NativeSelectRoot>
        <NativeSelectField
          id="workspace-programme"
          value={selectedSetup}
          onChange={(event) => setSelectedSetup(event.target.value)}
        >
          <option value="">{t("workspace-select-programme")}</option>
          {availableSetups.map((setup) => (
            <option key={setup.document_type} value={setup.document_type}>
              {setup.name}
            </option>
          ))}
        </NativeSelectField>
      </NativeSelectRoot>
      {chosenSetup && (
        <Text fontSize="body.sm" color="content.secondary">
          {t("workspace-programme-summary", {
            version: chosenSetup.version,
            chapters: chosenSetup.chapter_count,
            points: chosenSetup.point_count,
          })}
        </Text>
      )}
      <Button
        alignSelf="start"
        size="sm"
        disabled={!chosenSetup}
        loading={setupSaving}
        onClick={() => onSyncSetup?.(selectedSetup)}
      >
        {t("workspace-use-programme")}
      </Button>
    </VStack>
  );
  if (!workspace.setup?.ready)
    return (
      <VStack
        align="start"
        gap={4}
        p={{ base: 4, md: 5 }}
        maxW="64ch"
        data-testid="document-workspace-setup-empty"
      >
        <Heading as="h2" fontSize="title.md">
          {t(
            workspace.setup
              ? "workspace-template-needs-requirements"
              : "workspace-setup-needed",
          )}
        </Heading>
        <Text fontSize="body.md" lineHeight={1.6} color="content.secondary">
          {t(
            workspace.setup
              ? "workspace-template-needs-requirements-help"
              : "workspace-setup-empty-help",
          )}
        </Text>
        <HStack flexWrap="wrap">
          {setupPicker}
          {hasTemplate && (
            <Button
              size="sm"
              loading={setupSaving}
              onClick={() => onSyncSetup?.()}
            >
              {t("workspace-initialize")}
            </Button>
          )}
          <Button
            size="sm"
            variant={
              hasTemplate || availableSetups.length ? "outline" : "solid"
            }
            onClick={onOpenSetup}
          >
            {t(
              hasTemplate
                ? "workspace-change-template"
                : "workspace-choose-template",
            )}
          </Button>
        </HStack>
        {setupError && (
          <Text
            role="alert"
            fontSize="body.md"
            color="sentiment.negativeDefault"
          >
            {t("workspace-setup-error")}
          </Text>
        )}
        <Text fontSize="body.sm" lineHeight={1.5} color="content.tertiary">
          {t("workspace-setup-source-help")}
        </Text>
      </VStack>
    );
  return (
    <VStack align="stretch" gap={5} p={{ base: 4, md: 5 }}>
      <Flex justify="space-between" gap={3} align="start" flexWrap="wrap">
        <Box>
          <Heading as="h2" fontSize="title.md">
            {t("workspace-overview-tab")}
          </Heading>
          <Text mt={1} fontSize="body.sm" color="content.secondary">
            {workspace.setup.name} ·{" "}
            {t("workspace-pinned-version", {
              version: workspace.setup.version,
            })}
          </Text>
        </Box>
        <HStack gap={2} flexWrap="wrap">
          {workspace.setup.document_type === "concept_note" && (
            <Button size="xs" variant="plain" onClick={onOpenSetup}>
              {t("workspace-change-template")}
            </Button>
          )}
          <Button
            size="xs"
            variant="plain"
            loading={setupSaving}
            onClick={() => onSyncSetup?.(workspace.setup?.document_type)}
          >
            {t("workspace-sync-setup")}
          </Button>
        </HStack>
      </Flex>
      {availableSetups.length > 0 &&
        workspace.setup.document_type === "concept_note" && (
          <Box as="details">
            <Text
              as="summary"
              cursor="pointer"
              color="content.link"
              fontSize="body.sm"
            >
              {t("workspace-switch-programme")}
            </Text>
            <Box mt={3} maxW="32rem">
              {setupPicker}
            </Box>
          </Box>
        )}
      {setupError && (
        <Text role="alert" fontSize="body.sm" color="sentiment.negativeDefault">
          {t("workspace-setup-error")}
        </Text>
      )}
      <Flex
        gap={8}
        flexWrap="wrap"
        borderBottom="1px solid"
        borderColor="border.neutral"
        pb={4}
      >
        {(["required", "optional"] as const).map((kind) => (
          <Box key={kind} minW="140px" flex="1 1 140px">
            <Text fontSize="body.sm" color="content.secondary">
              {t(`workspace-${kind}`)}
            </Text>
            <Text mt={1} fontSize="body.lg" fontWeight="semibold">
              {overview[`${kind}_total`]
                ? t("workspace-coverage-count", {
                    covered: overview[`${kind}_covered`],
                    total: overview[`${kind}_total`],
                  })
                : t(`workspace-no-${kind}-points`)}
            </Text>
            {overview[`${kind}_total`] > 0 && (
              <chakra.progress
                aria-label={t(`workspace-${kind}`)}
                value={overview[`${kind}_covered`]}
                max={overview[`${kind}_total`]}
                w="full"
                maxW="260px"
                h="6px"
                mt={2}
                css={{ accentColor: "var(--chakra-colors-content-link)" }}
              />
            )}
          </Box>
        ))}
      </Flex>
      <Box>
        <Heading as="h3" fontSize="body.md" mb={2}>
          {t("workspace-next-action")}
        </Heading>
        {next[0] ? (
          <>
            <Text fontSize="body.md" color="content.secondary" mb={3}>
              {t("workspace-next-point-help")}
            </Text>
            <Button
              size="sm"
              h="auto"
              minH="36px"
              py={2}
              whiteSpace="normal"
              onClick={() => onSelectPoint(next[0]!.key)}
            >
              {next[0].label}
            </Button>
            <VStack align="stretch" gap={0} mt={2}>
              {next.slice(1).map((point) => (
                <Button
                  key={point.key}
                  size="sm"
                  variant="plain"
                  justifyContent="start"
                  h="auto"
                  py={2}
                  whiteSpace="normal"
                  onClick={() => onSelectPoint(point.key)}
                >
                  {point.label}
                </Button>
              ))}
            </VStack>
          </>
        ) : reviewPending ? (
          <>
            <Text fontSize="body.md" mb={3} color="content.secondary">
              {t("workspace-proposal-next")}
            </Text>
            <Button size="sm" onClick={onViewChanges}>
              {t("edit-view-changes")}
            </Button>
          </>
        ) : gapEntries[0] ? (
          <>
            <Text fontSize="body.md" mb={3} color="content.secondary">
              {t("workspace-open-question-next", {
                count: gapEntries.length,
                chapter: gapEntries[0].chapter.title,
              })}
            </Text>
            <Button
              size="sm"
              onClick={() =>
                onOpenGap?.(gapEntries[0].chapter, gapEntries[0].row)
              }
            >
              {t("workspace-open-question")}
            </Button>
          </>
        ) : (
          <>
            <Text
              fontSize="body.md"
              lineHeight={1.5}
              color="content.secondary"
              mb={3}
            >
              {t(
                workspace.export_eligibility.final
                  ? "workspace-ready-for-final"
                  : chapters.some((chapter) => chapter.body_markdown)
                    ? "workspace-ready-for-review"
                    : "workspace-ready-for-working-draft",
              )}
            </Text>
            <Button
              size="sm"
              onClick={
                workspace.export_eligibility.final ? onOpenExport : onOpenDraft
              }
            >
              {t(
                workspace.export_eligibility.final
                  ? "workspace-export-final"
                  : "workspace-open-draft",
              )}
            </Button>
          </>
        )}
        {gapEntries.length > 0 && (next[0] || reviewPending) && (
          <Button
            mt={2}
            size="sm"
            variant="plain"
            onClick={() =>
              onOpenGap?.(gapEntries[0].chapter, gapEntries[0].row)
            }
          >
            {t("workspace-open-question-next", {
              count: gapEntries.length,
              chapter: gapEntries[0].chapter.title,
            })}
          </Button>
        )}
      </Box>
      <Box
        className={styles.overviewColumns}
        borderTop="1px solid"
        borderColor="border.neutral"
        pt={4}
      >
        <VStack align="stretch" gap={5}>
          {covered.length > 0 && (
            <Box>
              <Heading as="h3" fontSize="body.md" mb={2}>
                {t("workspace-known-facts")}
              </Heading>
              <VStack as="dl" align="stretch" gap={0}>
                {requiredFacts
                  .concat(
                    optionalFacts.filter(
                      (point) => point.status !== "not_applicable",
                    ),
                  )
                  .slice(0, 6)
                  .map((point) => {
                    const citations = groupSourceCitations(
                      currentPointCandidate(point)?.citations ?? [],
                    );
                    return (
                      <Box
                        key={point.key}
                        py={3}
                        borderBottom="1px solid"
                        borderColor="border.neutral"
                      >
                        <Box as="dt">
                          <Button
                            variant="plain"
                            h="auto"
                            minH="24px"
                            p={0}
                            fontSize="body.sm"
                            color="content.secondary"
                            whiteSpace="normal"
                            textAlign="left"
                            onClick={() => onSelectPoint(point.key)}
                          >
                            {point.label}
                          </Button>
                        </Box>
                        <Text
                          as="dd"
                          mt={1}
                          fontSize="body.md"
                          whiteSpace="pre-wrap"
                          overflowWrap="anywhere"
                        >
                          {point.status === "not_applicable"
                            ? t("workspace-not-applicable")
                            : pointDisplayValue(point, lng)}
                        </Text>
                        {point.accepted_reason && (
                          <Text
                            mt={1}
                            fontSize="body.sm"
                            lineHeight={1.5}
                            color="content.secondary"
                          >
                            {point.accepted_reason}
                          </Text>
                        )}
                        {citations.length > 0 && (
                          <Box as="details" mt={2}>
                            <Text
                              as="summary"
                              cursor="pointer"
                              fontSize="body.sm"
                              color="content.link"
                            >
                              {t("workspace-sources-count", {
                                count: citations.length,
                              })}
                            </Text>
                            {citations.map((citation, index) => (
                              <Box
                                key={index}
                                borderLeft="2px solid"
                                borderColor="border.neutral"
                                pl={3}
                                mt={2}
                              >
                                <Text fontSize="body.sm" lineHeight={1.6}>
                                  <SourceQuotation
                                    citation={citation}
                                    lng={lng}
                                  />
                                </Text>
                                <Text
                                  mt={1}
                                  fontSize="body.sm"
                                  color="content.tertiary"
                                >
                                  {citation.source_label}
                                  {citation.page_number !== null
                                    ? ` · ${t("workspace-page", { page: citation.page_number })}`
                                    : ""}
                                </Text>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
              </VStack>
              {optionalFacts.some(
                (point) => point.status === "not_applicable",
              ) && (
                <Box as="details" mt={3}>
                  <Text
                    as="summary"
                    fontSize="body.sm"
                    cursor="pointer"
                    color="content.secondary"
                  >
                    {t("workspace-optional-exceptions")}
                  </Text>
                  {optionalFacts
                    .filter((point) => point.status === "not_applicable")
                    .map((point) => (
                      <Box key={point.key} mt={2}>
                        <Button
                          variant="plain"
                          size="sm"
                          color="content.secondary"
                          onClick={() => onSelectPoint(point.key)}
                        >
                          {point.label}
                        </Button>
                        <Text fontSize="body.sm">
                          {t("workspace-not-applicable")}
                          {point.accepted_reason
                            ? ` · ${point.accepted_reason}`
                            : ""}
                        </Text>
                      </Box>
                    ))}
                </Box>
              )}
            </Box>
          )}
          {waiting.length > 0 && (
            <Box>
              <Heading as="h3" fontSize="body.md" mb={2}>
                {t("workspace-group-waiting", { count: waiting.length })}
              </Heading>
              {waiting.map((point) => (
                <Box key={point.key} py={2}>
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
                  <Text
                    mt={1}
                    fontSize="body.sm"
                    lineHeight={1.5}
                    color="content.secondary"
                  >
                    {[
                      point.task?.waiting_for,
                      point.task?.requested_information,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </VStack>
        <Box>
          <HStack justify="space-between" mb={2}>
            <Heading as="h3" fontSize="body.md">
              {t("workspace-draft-shape")}
            </Heading>
            <Button size="xs" variant="plain" onClick={onOpenDraft}>
              {t("workspace-open-draft")}
            </Button>
          </HStack>
          {chapters.length > 0 ? (
            <VStack as="ol" align="stretch" gap={0} listStyleType="none">
              {chapters.map((chapter, index) => (
                <Box
                  as="li"
                  key={chapter.chapter_id}
                  py={3}
                  borderBottom="1px solid"
                  borderColor="border.neutral"
                >
                  <Text fontSize="body.md" fontWeight="medium">
                    {chapterDisplayTitle(chapter.title, index)}
                  </Text>
                  <Text mt={1} fontSize="body.sm" color="content.secondary">
                    {t(
                      chapter.body_markdown
                        ? "workspace-chapter-drafted"
                        : "workspace-chapter-not-drafted",
                    )}
                  </Text>
                </Box>
              ))}
            </VStack>
          ) : (
            <Text fontSize="body.sm" lineHeight={1.6} color="content.secondary">
              {t("workspace-outline-before-draft")}
            </Text>
          )}
        </Box>
      </Box>
    </VStack>
  );
}
export function WorkspaceTodos({
  workspace,
  lng,
  onSelectPoint,
  selectedKey,
  guidedQuestion,
  runId,
  onAddSource,
  onOpenContext,
  sourceBusy,
}: PanelProps & {
  selectedKey: string | null;
  guidedQuestion?: DocumentPointQuestion;
  runId: string;
  onAddSource: () => void;
  onOpenContext?: () => void;
  sourceBusy?: boolean;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const detail = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLocaleLowerCase(lng);
  const visiblePoints = workspace.points.filter(
    (point) =>
      !query ||
      point.label.toLocaleLowerCase(lng).includes(query) ||
      point.key.toLowerCase().includes(query),
  );
  const selected =
    workspace.points.find((point) => point.key === selectedKey) ??
    workspace.points.find(
      (point) => point.point_id === workspace.overview.next_steps[0]?.point_id,
    ) ??
    workspace.points.find((point) => pointGroup(point) !== "covered") ??
    workspace.points[0];
  if (!selected)
    return (
      <Box p={5}>
        <Heading as="h2" fontSize="title.md">
          {t("workspace-todo-tab")}
        </Heading>
        <Text
          mt={2}
          fontSize="body.md"
          lineHeight={1.6}
          color="content.secondary"
        >
          {t("workspace-points-empty")}
        </Text>
      </Box>
    );
  return (
    <Box p={{ base: 4, md: 5 }} className={styles.todo}>
      <VStack
        as="nav"
        aria-label={t("workspace-points-label")}
        align="stretch"
        gap={4}
      >
        <Input
          type="search"
          size="sm"
          value={filter}
          aria-label={t("workspace-find-point")}
          placeholder={t("workspace-find-point")}
          onChange={(event) => setFilter(event.target.value)}
        />
        {!visiblePoints.length && (
          <Text role="status" fontSize="body.sm">
            {t("workspace-no-matching-points")}
          </Text>
        )}
        {pointGroups.map((group) => {
          const points = visiblePoints.filter(
            (point) => pointGroup(point) === group,
          );
          if (!points.length) return null;
          const content = (
            <VStack align="stretch" gap={0}>
              {points.map((point) => (
                <Button
                  key={point.key}
                  variant="plain"
                  h="auto"
                  minH="40px"
                  py={2}
                  px={3}
                  justifyContent="start"
                  whiteSpace="normal"
                  textAlign="left"
                  borderLeft="2px solid"
                  borderColor={
                    selected.key === point.key ? "content.link" : "transparent"
                  }
                  bg={
                    selected.key === point.key
                      ? "background.alternativeLight"
                      : "transparent"
                  }
                  aria-current={selected.key === point.key ? "true" : undefined}
                  onClick={() => {
                    onSelectPoint(point.key);
                    requestAnimationFrame(() => {
                      detail.current?.focus({ preventScroll: true });
                      detail.current?.scrollIntoView?.({
                        block: "nearest",
                        inline: "nearest",
                      });
                    });
                  }}
                >
                  <Box>
                    <Text fontSize="body.sm">{point.label}</Text>
                    <Text
                      mt={0.5}
                      fontSize="body.sm"
                      fontWeight="normal"
                      color="content.tertiary"
                    >
                      {t(
                        point.required
                          ? "workspace-required"
                          : "workspace-optional",
                      )}
                      {point.task?.status === "parked" &&
                        ` · ${t("workspace-parked-label")}`}
                      {point.task?.status === "waiting" &&
                        point.task.waiting_for &&
                        ` · ${point.task.waiting_for}`}
                    </Text>
                  </Box>
                </Button>
              ))}
            </VStack>
          );
          return (
            <chakra.details
              key={group}
              open={
                Boolean(query) || pointGroup(selected) === group || undefined
              }
            >
              <Text
                as="summary"
                cursor="pointer"
                fontWeight="semibold"
                fontSize="body.sm"
                color="content.secondary"
                mb={1}
              >
                {t(`workspace-group-${group}`, { count: points.length })}
              </Text>
              {content}
            </chakra.details>
          );
        })}
      </VStack>
      <Box
        ref={detail}
        tabIndex={-1}
        className={
          query && !visiblePoints.some((point) => point.key === selected.key)
            ? styles.filteredDetail
            : undefined
        }
        minW={0}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "content.link",
          outlineOffset: "4px",
        }}
      >
        <DocumentPointCard
          key={selected.point_id}
          point={selected}
          guidedQuestion={guidedQuestion}
          needs={workspace.needs.filter(
            (need) =>
              need.point_keys.includes(selected.key) &&
              (need.status !== "available" ||
                pointGroup(selected) === "evidence" ||
                pointGroup(selected) === "waiting"),
          )}
          runId={runId}
          lng={lng}
          onAddSource={onAddSource}
          onOpenContext={onOpenContext}
          sourceBusy={sourceBusy}
        />
      </Box>
    </Box>
  );
}
