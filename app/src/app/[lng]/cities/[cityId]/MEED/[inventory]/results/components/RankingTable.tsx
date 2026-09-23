"use client";
import React from "react";
import { Box, Card, HStack, Icon, IconButton, Table } from "@chakra-ui/react";
import { LuDownload, LuSquareArrowOutUpRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { MeedInfoTip } from "../../../components/MeedInfoTip";
import { MeedScoreComposition } from "../../../components/MeedScoreComposition";
import { TitleLarge } from "@/components/package/Texts/Title";
import { BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import { GenerateReportControl } from "./ResultsHeader";
import { FOCUS_RING } from "../../../focusRing";
import type { MeedScoreWeights } from "./rankingFacts";
import { actionName, sectorLabel, type MeedActionIndex } from "./actionCatalog";

/**
 * The full ranked-actions table. Names and sectors come from the action
 * catalog index; rank and scores come from the prioritization ranking result.
 *
 * The score-composition column shows *how* each action earned its final
 * score — the same three weighted pillars the drawer breaks down — as a bar
 * only; the number lives once, in the final-score column, and the exact parts
 * are on hover.
 *
 * The leading checkbox column shares its state with the top-pick cards. When
 * the caller wires `onGenerate`, the report control sits in this header, next
 * to the checkboxes that feed it.
 *
 * This component stays presentational: the export button only calls back, and
 * the caller — which knows the city and inventory year — builds the file.
 */
export function RankingTable({
  actions,
  index,
  weights,
  t,
  onSelect,
  selectedIds,
  onToggleSelect,
  onExport,
  onGenerate,
  isGenerating = false,
  progress = null,
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  weights: MeedScoreWeights;
  t: TFunction;
  onSelect: (action: MeedRankedActionResult) => void;
  selectedIds: string[];
  onToggleSelect: (actionId: string) => void;
  onExport?: () => void;
  /** Renders the report control in the header when set. */
  onGenerate?: () => void;
  isGenerating?: boolean;
  progress?: string | null;
}) {
  return (
    <Card.Root overflow="hidden">
      <HStack
        px="l"
        py="l"
        gap="m"
        alignItems="flex-start"
        justifyContent="space-between"
        borderBottomWidth="1px"
        borderColor="border.overlay"
        flexWrap="wrap"
      >
        <Box flex="1" minW="240px">
          <TitleLarge color="content.primary">{t("table-title")}</TitleLarge>
          <BodyMedium color="content.secondary" mt="s">
            {t("table-description", { count: actions.length })}
          </BodyMedium>
        </Box>
        <HStack gap="m" alignItems="flex-start" flexWrap="wrap">
          {onExport && (
            <MeedButton
              variant="outlined"
              flexShrink={0}
              leftIcon={<Icon as={LuDownload} boxSize="16px" />}
              onClick={onExport}
              _focusVisible={FOCUS_RING}
            >
              {t("export-csv")}
            </MeedButton>
          )}
          {onGenerate && (
            <GenerateReportControl
              selectedCount={selectedIds.length}
              isGenerating={isGenerating}
              progress={progress}
              onGenerate={onGenerate}
              t={t}
              hintId="meed-report-hint-table"
            />
          )}
        </HStack>
      </HStack>
      <Table.Root size="md">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="40px">
              {t("column-select")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>{t("column-rank")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("column-action")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("column-sector")}</Table.ColumnHeader>
            <Table.ColumnHeader
              w="220px"
              display={{ base: "none", md: "table-cell" }}
            >
              <HStack gap="xs" alignItems="center">
                <span>{t("column-composition")}</span>
                <MeedInfoTip
                  content={t("column-composition-info")}
                  ariaLabel={t("column-composition-info")}
                />
              </HStack>
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              {t("column-score")}
            </Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {actions.map((action) => {
            const name = actionName(index, action.action_id, t);
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
                  <BodyMedium color="content.link" fontWeight="bold">
                    #{action.rank}
                  </BodyMedium>
                </Table.Cell>
                <Table.Cell maxW="280px">
                  <BodyMedium color="content.primary">{name}</BodyMedium>
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap">
                  <BodyMedium color="content.secondary">
                    {sectorLabel(index, action.action_id, t)}
                  </BodyMedium>
                </Table.Cell>
                <Table.Cell display={{ base: "none", md: "table-cell" }}>
                  <Box w="180px">
                    <MeedScoreComposition
                      action={action}
                      weights={weights}
                      variant="bar"
                      t={t}
                    />
                  </Box>
                </Table.Cell>
                <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
                  <LabelLarge color="content.primary">
                    {action.final_score.toFixed(2)}
                  </LabelLarge>
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
    </Card.Root>
  );
}
