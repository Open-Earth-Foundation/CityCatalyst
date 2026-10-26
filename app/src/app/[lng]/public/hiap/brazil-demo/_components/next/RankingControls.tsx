"use client";
import React, { useState } from "react";
import {
  Box,
  Collapsible,
  HStack,
  Icon,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp, LuRotateCcw } from "react-icons/lu";
import type { TFunction } from "i18next";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedChipGroup } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedChipGroup";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { CoBenefitKey, RiskCellKey, Timeline } from "../../_lib/types";
import type { TrackData } from "../../_lib/useTrack";
import type { useLabels } from "../../_lib/useLabels";
import { ADAPTA_SECTORS, RISK_CELLS } from "../../_lib/riskCells";
import { CO_BENEFIT_KEYS } from "../../_lib/coBenefits";
import { pick } from "../../_lib/localized";
import { SelectAllBar } from "./SelectAllBar";
import { WeightSliders, isCustomWeights } from "./WeightSliders";

const TIMELINES: Timeline[] = ["<5 years", "5-10 years", ">10 years"];

function Group({
  title,
  note,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  note?: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={(d) => setOpen(d.open)}>
      <Collapsible.Trigger asChild>
        <Box
          as="button"
          w="full"
          textAlign="start"
          py="s"
          _focusVisible={FOCUS_RING}
        >
          <HStack justifyContent="space-between" gap="s">
            <HStack gap="s" flexWrap="wrap">
              <TitleMedium as="span" color="content.primary">
                {title}
              </TitleMedium>
              {badge}
            </HStack>
            <Icon
              as={open ? LuChevronUp : LuChevronDown}
              boxSize="16px"
              color="content.tertiary"
            />
          </HStack>
        </Box>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <VStack alignItems="stretch" gap="s" pb="m">
          {note && <BodySmall color="content.tertiary">{note}</BodySmall>}
          {children}
        </VStack>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/**
 * BR-N1's side panel: the controls of BR-A3 and BR-A4 next to the list, with
 * no save step. Filters (local state) narrow the rows; preferences and weights
 * write straight to the browser and the ranking recomputes on the spot.
 */
export function RankingControls({
  lng,
  data,
  labels,
  t,
  tPre,
}: {
  lng: string;
  data: TrackData;
  labels: ReturnType<typeof useLabels>;
  /** Demo namespace. */
  t: TFunction;
  /** `meed-preflight` namespace. */
  tPre: TFunction;
}) {
  const { state, setPreferences, reset } = data;
  const prefs = state.preferences;

  const sectorOptions = ADAPTA_SECTORS.map((key) => ({
    value: key,
    label: labels.sector(key),
  }));
  const hazardOptions = RISK_CELLS.map((c) => ({
    value: c.key,
    label: pick(c.label, lng),
  }));
  const coBenefitOptions = CO_BENEFIT_KEYS.map((key) => ({
    value: key,
    label: labels.coBenefit(key),
  }));
  const timelineOptions = TIMELINES.map((key) => ({
    value: key,
    label: labels.timeline(key),
  }));

  const prefCount =
    prefs.coBenefits.length +
    prefs.priorityRisks.length +
    prefs.sectors.length +
    prefs.timeline.length;
  const isCustom =
    prefCount > 0 ||
    prefs.excludedActionIds.length > 0 ||
    isCustomWeights(prefs.weights);

  return (
    <VStack alignItems="stretch" gap="l">
      <VStack alignItems="stretch" gap="xs">
        <TitleMedium as="span" color="content.primary">
          {t("next-controls-title")}
        </TitleMedium>
        <BodySmall color="content.tertiary">
          {t("next-controls-intro")}
        </BodySmall>
      </VStack>

      {/* Preferences — change the Alignment pillar. */}
      <VStack alignItems="stretch" gap="xs">
        <Overline color="content.tertiary">{t("next-prefs-title")}</Overline>
        <BodySmall color="content.tertiary">{t("next-prefs-note")}</BodySmall>
        <Group
          title={t("next-prefs-cobenefits")}
          defaultOpen
          badge={
            prefs.coBenefits.length ? (
              <BodySmall color="content.secondary">
                {prefs.coBenefits.length}
              </BodySmall>
            ) : null
          }
        >
          <SelectAllBar
            total={CO_BENEFIT_KEYS.length}
            selected={prefs.coBenefits.length}
            onSelectAll={() =>
              setPreferences({ coBenefits: [...CO_BENEFIT_KEYS] })
            }
            onClear={() => setPreferences({ coBenefits: [] })}
            t={t}
          />
          <MeedChipGroup
            options={coBenefitOptions}
            selected={prefs.coBenefits}
            onChange={(next) =>
              setPreferences({ coBenefits: next as CoBenefitKey[] })
            }
            ariaLabel={t("next-prefs-cobenefits")}
          />
        </Group>
        <Group
          title={t("next-prefs-risks")}
          badge={
            prefs.priorityRisks.length ? (
              <BodySmall color="content.secondary">
                {prefs.priorityRisks.length}
              </BodySmall>
            ) : null
          }
        >
          <SelectAllBar
            total={RISK_CELLS.length}
            selected={prefs.priorityRisks.length}
            onSelectAll={() =>
              setPreferences({ priorityRisks: RISK_CELLS.map((c) => c.key) })
            }
            onClear={() => setPreferences({ priorityRisks: [] })}
            t={t}
          />
          <MeedChipGroup
            options={hazardOptions}
            selected={prefs.priorityRisks}
            onChange={(next) =>
              setPreferences({ priorityRisks: next as RiskCellKey[] })
            }
            ariaLabel={t("next-prefs-risks")}
          />
        </Group>
        <Group
          title={t("next-prefs-sectors")}
          badge={
            prefs.sectors.length ? (
              <BodySmall color="content.secondary">
                {prefs.sectors.length}
              </BodySmall>
            ) : null
          }
        >
          <SelectAllBar
            total={ADAPTA_SECTORS.length}
            selected={prefs.sectors.length}
            onSelectAll={() => setPreferences({ sectors: [...ADAPTA_SECTORS] })}
            onClear={() => setPreferences({ sectors: [] })}
            t={t}
          />
          <MeedChipGroup
            options={sectorOptions}
            selected={prefs.sectors}
            onChange={(next) => setPreferences({ sectors: next })}
            ariaLabel={t("next-prefs-sectors")}
          />
        </Group>
        <Group
          title={t("next-prefs-timeline")}
          badge={
            prefs.timeline.length ? (
              <BodySmall color="content.secondary">
                {prefs.timeline.length}
              </BodySmall>
            ) : null
          }
        >
          <MeedChipGroup
            options={timelineOptions}
            selected={prefs.timeline}
            onChange={(next) =>
              setPreferences({ timeline: next as Timeline[] })
            }
            ariaLabel={t("next-prefs-timeline")}
          />
        </Group>
        <BodySmall color="content.tertiary">
          {t("next-exclusions-note")}
        </BodySmall>
      </VStack>

      {/* Advanced — weights, collapsed and flagged as under review. */}
      <Box pt="m" borderTopWidth="1px" borderColor="border.overlay">
        <Group
          title={t("next-advanced-title")}
          note={t("next-advanced-note")}
          badge={
            isCustomWeights(prefs.weights) ? (
              <BodySmall color="content.secondary">
                {tPre("custom-weights-active")}
              </BodySmall>
            ) : null
          }
        >
          <WeightSliders
            weights={prefs.weights}
            onChange={(weights) => setPreferences({ weights })}
            t={t}
            tPre={tPre}
          />
        </Group>
      </Box>

      <SimpleGrid columns={1}>
        <MeedButton
          variant="outlined"
          minW="auto"
          px="m"
          disabled={!isCustom}
          leftIcon={<Icon as={LuRotateCcw} boxSize="14px" />}
          onClick={reset}
          _focusVisible={FOCUS_RING}
        >
          {t("next-reset")}
        </MeedButton>
      </SimpleGrid>
    </VStack>
  );
}
