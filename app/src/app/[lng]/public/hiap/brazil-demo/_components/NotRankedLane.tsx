"use client";
import React from "react";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import {
  LuCircleOff,
  LuLink2,
  LuMapPinOff,
  LuScale,
  LuUserX,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { IconType } from "react-icons";
import { BodyMedium } from "@/components/package/Texts/Body";
import { TitleMedium, TitleLarge } from "@/components/package/Texts/Title";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import type { NotRankedAction, NotRankedReason } from "../_lib/ranking";
import type { AdaptationAction } from "../_lib/types";
import { UNCOVERED_HAZARD_LABEL } from "../_lib/riskCells";
import { pick } from "../_lib/localized";
import { ActionMiniCard } from "./ActionMiniCard";

const REASON_ICON: Record<NotRankedReason, IconType> = {
  outside_coverage: LuMapPinOff,
  no_impact_here: LuCircleOff,
  complementary: LuLink2,
  legally_blocked: LuScale,
  excluded_by_city: LuUserX,
};

const REASON_TONE: Record<NotRankedReason, MeedTone> = {
  outside_coverage: "warning",
  no_impact_here: "neutral",
  complementary: "info",
  legally_blocked: "negative",
  excluded_by_city: "neutral",
};

const ORDER: NotRankedReason[] = [
  "outside_coverage",
  "complementary",
  "no_impact_here",
  "legally_blocked",
  "excluded_by_city",
];

/**
 * Actions that are in the bank but not in the ranking, grouped by the reason —
 * each group says in one sentence why, because "not ranked" must never read as
 * "low priority". The actions use the same compact card as related actions in
 * the drawer, with the reason in place of a score.
 */
export function NotRankedLane({
  items,
  lng,
  t,
  onOpen,
}: {
  items: NotRankedAction[];
  lng: string;
  t: TFunction;
  onOpen: (action: AdaptationAction) => void;
}) {
  if (items.length === 0) return null;
  const groups = ORDER.map((reason) => ({
    reason,
    actions: items.filter((i) => i.reason === reason).map((i) => i.action),
  })).filter((g) => g.actions.length > 0);

  return (
    <VStack alignItems="stretch" gap="l">
      <VStack alignItems="stretch" gap="s">
        <TitleLarge color="content.primary">
          {t("not-ranked-title", { count: items.length })}
        </TitleLarge>
        <BodyMedium color="content.secondary">
          {t("not-ranked-description")}
        </BodyMedium>
      </VStack>
      {groups.map(({ reason, actions }) => (
        <Card.Root key={reason} borderColor="border.overlay">
          <Card.Body p="l">
            <VStack alignItems="stretch" gap="l">
              <HStack gap="s" alignItems="flex-start">
                <Icon
                  as={REASON_ICON[reason]}
                  boxSize="18px"
                  color="content.secondary"
                  mt="2px"
                />
                <VStack alignItems="flex-start" gap="xs" flex="1">
                  <HStack gap="s" flexWrap="wrap">
                    <TitleMedium color="content.primary">
                      {t(`reason-${reason}`)}
                    </TitleMedium>
                    <MeedStatusTag tone={REASON_TONE[reason]}>
                      {t(`reason-${reason}-tag`)}
                    </MeedStatusTag>
                  </HStack>
                  <BodyMedium color="content.secondary">
                    {t(`reason-${reason}-body`)}
                  </BodyMedium>
                </VStack>
              </HStack>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap="m">
                {actions.map((action) => (
                  <ActionMiniCard
                    key={action.id}
                    action={action}
                    lng={lng}
                    note={pick(action.description, lng)}
                    tag={
                      action.uncoveredHazard ? (
                        <MeedStatusTag tone="warning">
                          {t("not-ranked-hazard", {
                            hazard: pick(
                              UNCOVERED_HAZARD_LABEL[action.uncoveredHazard],
                              lng,
                            ),
                          })}
                        </MeedStatusTag>
                      ) : (
                        <MeedStatusTag tone={REASON_TONE[reason]}>
                          {t(`reason-${reason}-tag`)}
                        </MeedStatusTag>
                      )
                    }
                    onOpen={() => onOpen(action)}
                    t={t}
                  />
                ))}
              </SimpleGrid>
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}
    </VStack>
  );
}
