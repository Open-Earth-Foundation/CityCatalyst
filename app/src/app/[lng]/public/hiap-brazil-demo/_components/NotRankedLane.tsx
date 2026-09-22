"use client";
import React from "react";
import { Card, HStack, Icon, VStack } from "@chakra-ui/react";
import {
  LuCircleOff,
  LuLink2,
  LuMapPinOff,
  LuScale,
  LuUserX,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { IconType } from "react-icons";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import type { NotRankedAction, NotRankedReason } from "../_lib/ranking";
import type { AdaptationAction } from "../_lib/types";
import { UNCOVERED_HAZARD_LABEL } from "../_lib/riskCells";
import { pick } from "../_lib/localized";

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
 * "low priority". The methodology asks for a display separate from the main
 * list for hazards outside AdaptaBrasil (§9.1); the same lane also carries the
 * complementary (enabling) actions the Sep 8 review moved out of scoring.
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
    <VStack alignItems="stretch" gap="m">
      <VStack alignItems="stretch" gap="xs">
        <TitleMedium color="content.primary">
          {t("not-ranked-title", { count: items.length })}
        </TitleMedium>
        <BodyMedium color="content.secondary">
          {t("not-ranked-description")}
        </BodyMedium>
      </VStack>
      {groups.map(({ reason, actions }) => (
        <Card.Root key={reason} borderColor="border.overlay">
          <Card.Body>
            <VStack alignItems="stretch" gap="m">
              <HStack gap="s" alignItems="flex-start">
                <Icon
                  as={REASON_ICON[reason]}
                  boxSize="18px"
                  color="content.secondary"
                  mt="2px"
                />
                <VStack alignItems="flex-start" gap="xs" flex="1">
                  <HStack gap="s" flexWrap="wrap">
                    <LabelLarge color="content.primary">
                      {t(`reason-${reason}`)}
                    </LabelLarge>
                    <MeedStatusTag tone={REASON_TONE[reason]}>
                      {t(`reason-${reason}-tag`)}
                    </MeedStatusTag>
                  </HStack>
                  <BodyMedium color="content.secondary">
                    {t(`reason-${reason}-body`)}
                  </BodyMedium>
                </VStack>
              </HStack>
              <VStack alignItems="stretch" gap="xs">
                {actions.map((action) => (
                  <HStack
                    key={action.id}
                    justifyContent="space-between"
                    gap="m"
                    py="m"
                    borderTopWidth="1px"
                    borderColor="border.overlay"
                  >
                    <VStack alignItems="flex-start" gap="xs" minW={0}>
                      <BodyMedium color="content.primary" fontWeight="semibold">
                        {pick(action.name, lng)}
                      </BodyMedium>
                      {action.uncoveredHazard && (
                        <BodySmall color="content.tertiary">
                          {t("not-ranked-hazard", {
                            hazard: pick(
                              UNCOVERED_HAZARD_LABEL[action.uncoveredHazard],
                              lng,
                            ),
                          })}
                        </BodySmall>
                      )}
                    </VStack>
                    <MeedButton
                      variant="outlined"
                      minW="auto"
                      px="m"
                      onClick={() => onOpen(action)}
                    >
                      {t("not-ranked-open")}
                    </MeedButton>
                  </HStack>
                ))}
              </VStack>
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}
    </VStack>
  );
}
