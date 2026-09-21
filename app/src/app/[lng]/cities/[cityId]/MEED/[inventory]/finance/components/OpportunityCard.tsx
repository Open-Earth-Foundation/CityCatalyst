"use client";
import { Card, HStack, Link, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import { FOCUS_RING, humanizeEnum, STATUS_KEYS, STATUS_TONE } from "../labels";
import type { Opportunity } from "../types";

export interface OpportunityCardProps {
  opp: Opportunity;
  t: TFunction;
}

/** One matched funding opportunity. */
export function OpportunityCard({ opp, t }: OpportunityCardProps) {
  const status = (opp.status ?? "").toLowerCase();
  const statusKey = STATUS_KEYS[status];
  const snippet = opp.amount_note ?? opp.notes ?? "";

  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body p="m">
        <VStack alignItems="stretch" gap="s">
          <HStack
            justifyContent="space-between"
            alignItems="flex-start"
            gap="s"
          >
            <LabelLarge color="content.primary" wordBreak="break-word">
              {opp.opportunity_name ?? t("opportunity-fallback-name")}
            </LabelLarge>
            <HStack gap="xs" flexShrink={0}>
              {statusKey && (
                <MeedStatusTag tone={STATUS_TONE[status] ?? "neutral"}>
                  {t(statusKey)}
                </MeedStatusTag>
              )}
              {opp.instrument && (
                <MeedStatusTag tone="neutral">
                  {humanizeEnum(opp.instrument)}
                </MeedStatusTag>
              )}
            </HStack>
          </HStack>
          {opp.funder_name && <Caption>{opp.funder_name}</Caption>}
          {snippet && (
            <BodySmall color="content.secondary">
              {snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet}
            </BodySmall>
          )}
          {opp.source_url && (
            <Link
              href={opp.source_url}
              target="_blank"
              rel="noopener noreferrer"
              color="content.link"
              alignSelf="flex-start"
              borderRadius="minimal"
              _focusVisible={FOCUS_RING}
            >
              <LabelMedium color="content.link">{t("view-fund")}</LabelMedium>
            </Link>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
