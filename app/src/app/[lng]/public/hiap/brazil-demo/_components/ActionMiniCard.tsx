"use client";
import React from "react";
import { Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { AdaptationAction } from "../_lib/types";
import { SECTOR_LABEL } from "../_lib/riskCells";
import { pick } from "../_lib/localized";

/**
 * The compact action card used wherever an action is referenced rather than
 * ranked: related actions in the drawer, and the actions outside the ranking.
 * Same shape everywhere — sector and rank overline, name, one line of
 * context, a tag in place of a score, and one way to open the action.
 */
export function ActionMiniCard({
  action,
  lng,
  rank,
  note,
  tag,
  onOpen,
  t,
}: {
  action: AdaptationAction;
  lng: string;
  /** Position in the current ranking, or null when not ranked. */
  rank?: number | null;
  /** One line under the name: a rationale, or the action's description. */
  note?: string;
  tag?: React.ReactNode;
  onOpen: () => void;
  t: TFunction;
}) {
  return (
    <Card.Root borderColor="border.neutral" h="full">
      <Card.Body p="l">
        <VStack alignItems="stretch" gap="m" h="full">
          <HStack gap="s" flexWrap="wrap">
            <Overline color="content.tertiary">
              {pick(SECTOR_LABEL[action.sector], lng)}
            </Overline>
            {rank ? (
              <Overline color="content.link">
                {t("mini-rank", { rank })}
              </Overline>
            ) : null}
          </HStack>
          <LabelLarge color="content.primary">
            {pick(action.name, lng)}
          </LabelLarge>
          {note && <BodySmall color="content.secondary">{note}</BodySmall>}
          <HStack
            justifyContent="space-between"
            alignItems="center"
            gap="s"
            mt="auto"
            pt="xs"
          >
            <HStack gap="xs" flexWrap="wrap">
              {tag}
            </HStack>
            <MeedButton
              variant="text"
              px="0"
              minW="auto"
              rightIcon={<Icon as={LuArrowRight} boxSize="14px" />}
              onClick={onOpen}
              _focusVisible={FOCUS_RING}
            >
              {t("not-ranked-open")}
            </MeedButton>
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
