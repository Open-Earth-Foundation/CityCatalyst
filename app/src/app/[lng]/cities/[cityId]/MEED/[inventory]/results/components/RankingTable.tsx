"use client";
import React from "react";
import { Box, Card, HStack, Icon, IconButton, Table } from "@chakra-ui/react";
import { LuDownload, LuSquareArrowOutUpRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { ReductionBar } from "./ReductionBar";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import { FOCUS_RING } from "../../../focusRing";
import {
  actionName,
  sectorLabel,
  reductionLevel,
  reductionLevelLabelKey,
  reductionLevelColor,
  type MeedActionIndex,
} from "./actionCatalog";

/**
 * The full ranked-actions table. Names, sectors and reduction potential come
 * from the action catalog index; rank and scores come from the prioritization
 * ranking result.
 *
 * The leading checkbox column shares its state with the top-pick cards, so an
 * action ticked here is ticked there too and both feed the one report button in
 * the page header.
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
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  t: TFunction;
  onSelect: (action: MeedRankedActionResult) => void;
  selectedIds: string[];
  onToggleSelect: (actionId: string) => void;
  onExport?: () => void;
}) {
  return (
    <Card.Root overflow="hidden">
      <HStack
        px="l"
        py="m"
        gap="m"
        alignItems="flex-start"
        justifyContent="space-between"
        borderBottomWidth="1px"
        borderColor="border.overlay"
      >
        <Box>
          <TitleMedium color="content.primary">{t("table-title")}</TitleMedium>
          <BodySmall color="content.secondary" mt="xs">
            {t("table-description", { count: actions.length })}
          </BodySmall>
        </Box>
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
            <Table.ColumnHeader>{t("column-reduction")}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              {t("column-score")}
            </Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {actions.map((action) => {
            const level = reductionLevel(index, action.action_id);
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
                <Table.Cell>
                  <HStack gap="s">
                    <Box w="80px" flexShrink={0}>
                      <ReductionBar level={level} />
                    </Box>
                    <BodySmall
                      color={reductionLevelColor(level)}
                      whiteSpace="nowrap"
                    >
                      {t(reductionLevelLabelKey(level))}
                    </BodySmall>
                  </HStack>
                </Table.Cell>
                <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
                  <BodyMedium color="content.primary" fontWeight="bold">
                    {action.final_score.toFixed(2)}
                  </BodyMedium>
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
