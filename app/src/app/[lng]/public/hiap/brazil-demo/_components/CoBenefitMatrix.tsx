"use client";
import React from "react";
import { TitleLarge } from "@/components/package/Texts/Title";
import { Card, HStack, Table, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { MeedActionIndex } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/actionCatalog";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { formatMagnitude } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/CoBenefitStrip";
import type { CoBenefitKey } from "../_lib/types";
import { ACTION_BY_ID } from "../_lib/actions";
import {
  CO_BENEFIT_KEYS,
  CO_BENEFIT_LABEL,
  suppressionSources,
} from "../_lib/coBenefits";
import { pick } from "../_lib/localized";

type Cell =
  { kind: "score"; value: number } | { kind: "in_impact" } | { kind: "none" };

function cellFor(
  actionId: string,
  key: CoBenefitKey,
  index: MeedActionIndex,
): Cell {
  const fixture = ACTION_BY_ID[actionId];
  if (fixture) {
    if (suppressionSources(fixture).some((s) => s.key === key))
      return { kind: "in_impact" };
    const score = fixture.coBenefits[key];
    return score === undefined
      ? { kind: "none" }
      : { kind: "score", value: score };
  }
  const raw = index.get(actionId)?.coBenefits?.[key]?.impact_numeric;
  return typeof raw === "number"
    ? { kind: "score", value: raw }
    : { kind: "none" };
}

/**
 * The methodology's eight co-benefit categories (§6.1) for the top actions:
 * one column per action, one row per category any of them touches, and the
 * −2…+2 score in each cell. Scores are assessed per action, never summed —
 * the matrix shows them side by side so the reader sees exactly which action
 * delivers or costs what, and where a category is already inside the Impact
 * score and therefore not scored again.
 */
export function CoBenefitMatrix({
  actions,
  index,
  lng,
  t,
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  lng: string;
  /** Demo namespace. */
  t: TFunction;
}) {
  const cells = new Map<string, Cell>();
  for (const action of actions) {
    for (const key of CO_BENEFIT_KEYS) {
      cells.set(
        `${action.action_id}:${key}`,
        cellFor(action.action_id, key, index),
      );
    }
  }
  const rows = CO_BENEFIT_KEYS.filter((key) =>
    actions.some((a) => cells.get(`${a.action_id}:${key}`)?.kind !== "none"),
  );
  if (actions.length === 0 || rows.length === 0) return null;

  return (
    <VStack alignItems="stretch" gap="m">
      <VStack alignItems="stretch" gap="s">
        <TitleLarge color="content.primary">{t("matrix-title")}</TitleLarge>
        <BodyMedium color="content.secondary">
          {t("matrix-description")}
        </BodyMedium>
      </VStack>
      <Card.Root overflow="hidden" borderColor="border.neutral">
        <Table.Root size="lg" tableLayout="fixed">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader w={{ base: "40%", md: "28%" }}>
                {t("matrix-col-category")}
              </Table.ColumnHeader>
              {actions.map((action) => {
                return (
                  <Table.ColumnHeader key={action.action_id}>
                    <VStack alignItems="flex-start" gap="xs">
                      <Overline color="content.link">
                        {t("mini-rank", { rank: action.rank })}
                      </Overline>
                      <LabelMedium color="content.primary" lineClamp={2}>
                        {index.get(action.action_id)?.actionName ??
                          action.action_id}
                      </LabelMedium>
                    </VStack>
                  </Table.ColumnHeader>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((key) => (
              <Table.Row key={key}>
                <Table.Cell>
                  <LabelMedium color="content.primary">
                    {pick(CO_BENEFIT_LABEL[key], lng)}
                  </LabelMedium>
                </Table.Cell>
                {actions.map((action) => {
                  const cell = cells.get(`${action.action_id}:${key}`)!;
                  return (
                    <Table.Cell key={action.action_id}>
                      {cell.kind === "score" ? (
                        <HStack gap="s" alignItems="center">
                          <MeedStatusTag
                            tone={
                              cell.value < 0
                                ? "negative"
                                : cell.value > 0
                                  ? "positive"
                                  : "neutral"
                            }
                          >
                            {cell.value === 0
                              ? "0"
                              : formatMagnitude(cell.value)}
                          </MeedStatusTag>
                          <BodySmall color="content.secondary">
                            {t(
                              `matrix-scale-${cell.value < 0 ? "adverse" : cell.value > 1 ? "strong" : cell.value > 0 ? "benefit" : "neutral"}`,
                            )}
                          </BodySmall>
                        </HStack>
                      ) : cell.kind === "in_impact" ? (
                        <MeedStatusTag tone="info">
                          {t("matrix-in-impact")}
                        </MeedStatusTag>
                      ) : (
                        <BodySmall color="content.tertiary">
                          {t("matrix-not-scored")}
                        </BodySmall>
                      )}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>
    </VStack>
  );
}
