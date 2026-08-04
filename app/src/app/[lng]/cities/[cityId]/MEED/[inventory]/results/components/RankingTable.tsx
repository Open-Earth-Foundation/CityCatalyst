"use client";
import React from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  IconButton,
  Table,
} from "@chakra-ui/react";
import { LuSquareArrowOutUpRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { ReductionBar } from "./ReductionBar";
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
 */
export function RankingTable({
  actions,
  index,
  t,
  onSelect,
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  t: TFunction;
  onSelect: (action: MeedRankedActionResult) => void;
}) {
  return (
    <Card.Root overflow="hidden">
      <Box px="20px" py="16px" borderBottomWidth="1px" borderColor="border.overlay">
        <TitleMedium color="content.primary">{t("table-title")}</TitleMedium>
        <BodySmall color="content.secondary" mt="2px">
          {t("table-description", { count: actions.length })}
        </BodySmall>
      </Box>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
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
            return (
              <Table.Row key={action.action_id}>
                <Table.Cell whiteSpace="nowrap">
                  <BodyMedium color="content.link" fontWeight="bold">
                    #{action.rank}
                  </BodyMedium>
                </Table.Cell>
                <Table.Cell maxW="280px">
                  <BodyMedium color="content.primary">
                    {actionName(index, action.action_id, t)}
                  </BodyMedium>
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap">
                  <BodyMedium color="content.secondary">
                    {sectorLabel(index, action.action_id, t)}
                  </BodyMedium>
                </Table.Cell>
                <Table.Cell>
                  <HStack gap="8px">
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
                    aria-label={t("view-details")}
                    size="2xs"
                    variant="ghost"
                    onClick={() => onSelect(action)}
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
