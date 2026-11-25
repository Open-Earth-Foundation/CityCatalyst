"use client";
import React from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  IconButton,
  Table,
  VStack,
} from "@chakra-ui/react";
import { LuDownload, LuSquareArrowOutUpRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { TitleLarge } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import { GenerateReportControl } from "./ResultsHeader";
import { FOCUS_RING } from "../../../focusRing";
import type { MeedScoreWeights } from "./rankingFacts";
import {
  LEGAL_CATEGORY_TONE,
  legalCategoryLabelKey,
  type MeedLegalStanding,
} from "../../regulations/legalStanding";
import { MeedLevel } from "../../../components/MeedLevel";
import { MeedColumnHeader } from "../../../components/MeedColumnHeader";
import {
  actionName,
  actionSectorTag,
  sectorLabel,
  type MeedActionIndex,
} from "./actionCatalog";
import { MeedSectorIcon } from "../../../components/MeedSectorIcon";

/**
 * The full ranked-actions table. Names and sectors come from the action
 * catalog index; rank and scores come from the prioritization ranking result.
 *
 * Each row carries the final score; how it is made up (the three weighted
 * pillars) lives on the cards and in the drawer, where there is room for it.
 *
 * The leading checkbox column shares its state with the top-pick cards. When
 * the caller wires `onGenerate`, the report control sits in this header, next
 * to the checkboxes that feed it. With `variant="controls"` the header is a
 * control panel (count, export, report) under a heading the caller owns.
 *
 * This component stays presentational: the export button only calls back, and
 * the caller — which knows the city and inventory year — builds the file.
 */
export function RankingTable({
  actions,
  index,
  t,
  onSelect,
  selectedIds,
  onToggleSelect,
  onExport,
  onGenerate,
  isGenerating = false,
  progress = null,
  legalFor,
  variant = "titled",
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  weights: MeedScoreWeights | null;
  t: TFunction;
  onSelect: (action: MeedRankedActionResult) => void;
  selectedIds: string[];
  onToggleSelect: (actionId: string) => void;
  onExport?: () => void;
  /** Renders the report control in the header when set. */
  onGenerate?: () => void;
  isGenerating?: boolean;
  progress?: string | null;
  /** Legal standing per action; adds the municipal-authority column when set. */
  legalFor?: (actionId: string) => MeedLegalStanding | null;
  /** `controls`: a count line instead of a title, for a caller-framed section. */
  variant?: "titled" | "controls";
}) {
  const controls = variant === "controls";
  return (
    <Card.Root overflow="hidden">
      <HStack
        px={controls ? "xl" : "l"}
        py="l"
        gap="m"
        alignItems="flex-start"
        justifyContent="space-between"
        borderBottomWidth="1px"
        borderColor="border.overlay"
        flexWrap="wrap"
      >
        {controls ? (
          <VStack alignItems="flex-start" gap="xs" flex="1" minW="240px">
            <BodySmall color="content.primary" fontWeight="semibold">
              {t("list-summary", { count: actions.length })}
            </BodySmall>
            <BodySmall color="content.secondary">{t("list-hint")}</BodySmall>
          </VStack>
        ) : (
          <Box flex="1" minW="240px">
            <TitleLarge color="content.primary">{t("table-title")}</TitleLarge>
            <BodyMedium color="content.secondary" mt="xs">
              {t("table-description", { count: actions.length })}
            </BodyMedium>
          </Box>
        )}
        {(() => {
          const exportButton = onExport ? (
            <MeedButton
              variant="outlined"
              flexShrink={0}
              leftIcon={<Icon as={LuDownload} boxSize="16px" />}
              onClick={onExport}
              _focusVisible={FOCUS_RING}
            >
              {t("export-csv")}
            </MeedButton>
          ) : null;
          // One group: the two controls side by side, the report hint under
          // both, so the pair never drifts apart when the hint is long.
          return onGenerate ? (
            <GenerateReportControl
              selectedCount={selectedIds.length}
              isGenerating={isGenerating}
              progress={progress}
              onGenerate={onGenerate}
              t={t}
              hintId="meed-report-hint-table"
              leading={exportButton}
            />
          ) : (
            exportButton
          );
        })()}
      </HStack>
      {/* Below the tablet breakpoint the table scrolls sideways instead of
          crushing the action name into one word per line. */}
      <Box overflowX="auto">
        <Table.Root size="md" minW="720px">
          <Table.Header>
            <Table.Row>
              {/* A visible "Select" heading made this 40 px column 109 px wide. */}
              <MeedColumnHeader
                label={t("column-select")}
                hideLabel
                width="40px"
              />
              <MeedColumnHeader label={t("column-rank")} width="64px" />
              {/* The name is what the row is about: it takes whatever width the
                fixed columns leave. */}
              <MeedColumnHeader label={t("column-action")} minW="240px" />
              <MeedColumnHeader label={t("column-sector")} />
              {legalFor && (
                <MeedColumnHeader
                  label={t("column-legal")}
                  tip={t("column-legal-info")}
                  display={{ base: "none", md: "table-cell" }}
                />
              )}
              <MeedColumnHeader label={t("column-score")} align="end" />
              <MeedColumnHeader width="40px" />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {actions.map((action) => {
              const name = actionName(index, action.action_id, t);
              const legal = legalFor?.(action.action_id) ?? null;
              return (
                <Table.Row key={action.action_id}>
                  <Table.Cell>
                    <SelectActionCheckbox
                      checked={selectedIds.includes(action.action_id)}
                      onToggle={() => onToggleSelect(action.action_id)}
                      ariaLabel={t("select-action", { name })}
                    />
                  </Table.Cell>
                  <Table.Cell whiteSpace="nowrap">
                    <BodyMedium
                      color="content.primary"
                      fontWeight="semibold"
                      fontVariantNumeric="tabular-nums"
                    >
                      #{action.rank}
                    </BodyMedium>
                  </Table.Cell>
                  <Table.Cell>
                    <BodyMedium color="content.primary">{name}</BodyMedium>
                  </Table.Cell>
                  <Table.Cell whiteSpace="nowrap">
                    <HStack gap="xs" alignItems="center">
                      <MeedSectorIcon
                        sectorTag={actionSectorTag(index, action.action_id)}
                        size="14px"
                      />
                      <BodyMedium color="content.secondary">
                        {sectorLabel(index, action.action_id, t)}
                      </BodyMedium>
                    </HStack>
                  </Table.Cell>
                  {legalFor && (
                    <Table.Cell display={{ base: "none", md: "table-cell" }}>
                      {legal && (
                        <MeedLevel tone={LEGAL_CATEGORY_TONE[legal.ownership]}>
                          {t(legalCategoryLabelKey(legal.ownership))}
                        </MeedLevel>
                      )}
                    </Table.Cell>
                  )}
                  <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
                    <BodySmall color="content.primary" fontWeight="semibold">
                      {action.final_score.toFixed(2)}
                    </BodySmall>
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    <IconButton
                      aria-label={t("select-action-details", { name })}
                      size="2xs"
                      variant="ghost"
                      onClick={() => onSelect(action)}
                      _focusVisible={FOCUS_RING}
                    >
                      <Icon as={LuSquareArrowOutUpRight} color="content.link" />
                    </IconButton>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>
    </Card.Root>
  );
}
