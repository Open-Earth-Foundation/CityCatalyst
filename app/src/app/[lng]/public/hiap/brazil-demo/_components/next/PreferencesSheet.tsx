"use client";
import React, { useState } from "react";
import {
  Box,
  Collapsible,
  Drawer,
  HStack,
  Icon,
  Portal,
  VStack,
} from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import type { TFunction } from "i18next";
import { CloseButton } from "@/components/ui/close-button";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedChipGroup } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedChipGroup";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type {
  CoBenefitKey,
  DemoPreferences,
  RiskCellKey,
  Timeline,
} from "../../_lib/types";
import type { useLabels } from "../../_lib/useLabels";
import { ADAPTA_SECTORS, RISK_CELLS } from "../../_lib/riskCells";
import { CO_BENEFIT_KEYS } from "../../_lib/coBenefits";
import { DEFAULT_WEIGHTS } from "../../_lib/state";
import { pick } from "../../_lib/localized";
import { SelectAllBar } from "./SelectAllBar";
import { TextLink } from "./TextLink";
import { WeightSliders, isCustomWeights } from "./WeightSliders";

const TIMELINES: Timeline[] = ["<5 years", "5-10 years", ">10 years"];

/** The parts of the preferences a city sets here; exclusions live on the list. */
export type RankingPriorities = Pick<
  DemoPreferences,
  "coBenefits" | "priorityRisks" | "sectors" | "timeline" | "weights"
>;

export const DEFAULT_PRIORITIES: RankingPriorities = {
  coBenefits: [],
  priorityRisks: [],
  sectors: [],
  timeline: [],
  weights: { ...DEFAULT_WEIGHTS },
};

export const priorityCount = (p: RankingPriorities) =>
  p.coBenefits.length +
  p.priorityRisks.length +
  p.sectors.length +
  p.timeline.length;

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

export function samePriorities(a: RankingPriorities, b: RankingPriorities) {
  return (
    sameSet(a.coBenefits, b.coBenefits) &&
    sameSet(a.priorityRisks, b.priorityRisks) &&
    sameSet(a.sectors, b.sectors) &&
    sameSet(a.timeline, b.timeline) &&
    (Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).every(
      (k) => a.weights[k] === b.weights[k],
    )
  );
}

/** One block of choices: what it is, what it does, and the chips. */
function Choice({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <VStack
      alignItems="stretch"
      gap="s"
      py="l"
      borderTopWidth="1px"
      borderColor="border.overlay"
      // The header already draws the line above the first block.
      _first={{ borderTopWidth: 0 }}
    >
      <TitleMedium as="h3" color="content.primary">
        {title}
      </TitleMedium>
      <BodySmall color="content.secondary">{help}</BodySmall>
      {children}
    </VStack>
  );
}

/**
 * BR-N1's preferences: a wide sheet instead of a narrow column. Choices are
 * a draft until the city runs a new ranking with them; nothing in the list
 * moves while the sheet is open. Leaving actions out stays on the list.
 */
export function PreferencesSheet({
  cityName,
  applied,
  onApply,
  onClose,
  lng,
  labels,
  t,
  tPre,
}: {
  cityName: string;
  applied: RankingPriorities;
  onApply: (next: RankingPriorities) => void;
  onClose: () => void;
  lng: string;
  labels: ReturnType<typeof useLabels>;
  t: TFunction;
  tPre: TFunction;
}) {
  const [draft, setDraft] = useState<RankingPriorities>(applied);
  const [advancedOpen, setAdvancedOpen] = useState(
    isCustomWeights(applied.weights),
  );
  const set = (patch: Partial<RankingPriorities>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const changed = !samePriorities(draft, applied);
  const isDefault = samePriorities(draft, DEFAULT_PRIORITIES);
  const count = priorityCount(draft);

  const groups: {
    key: "coBenefits" | "priorityRisks" | "sectors" | "timeline";
    options: { value: string; label: string }[];
  }[] = [
    {
      key: "coBenefits",
      options: CO_BENEFIT_KEYS.map((k) => ({
        value: k,
        label: labels.coBenefit(k),
      })),
    },
    {
      key: "priorityRisks",
      options: RISK_CELLS.map((c) => ({
        value: c.key,
        label: pick(c.label, lng),
      })),
    },
    {
      key: "sectors",
      options: ADAPTA_SECTORS.map((k) => ({
        value: k,
        label: labels.sector(k),
      })),
    },
    {
      key: "timeline",
      options: TIMELINES.map((k) => ({ value: k, label: labels.timeline(k) })),
    },
  ];

  return (
    <Drawer.Root
      open
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="end"
      size={{ base: "full", md: "lg" }}
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="base.light" maxW={{ md: "760px" }}>
            <Drawer.Header
              display="flex"
              flexDirection="column"
              alignItems="stretch"
              gap="s"
              px="xl"
              pt="xl"
              pb="l"
              borderBottomWidth="1px"
              borderColor="border.overlay"
            >
              <HStack justifyContent="space-between" alignItems="flex-start">
                <Drawer.Title asChild>
                  <TitleLarge color="content.primary">
                    {t("next-prefs-sheet-title")}
                  </TitleLarge>
                </Drawer.Title>
                <Drawer.CloseTrigger asChild>
                  <CloseButton
                    size="sm"
                    color="content.secondary"
                    aria-label={t("next-drawer-close")}
                  />
                </Drawer.CloseTrigger>
              </HStack>
              <BodyMedium color="content.secondary">
                {t("next-prefs-sheet-intro", { city: cityName })}
              </BodyMedium>
            </Drawer.Header>

            <Drawer.Body px="xl" py="0">
              {groups.map(({ key, options }) => (
                <Choice
                  key={key}
                  title={t(`next-prefs-group-${key}`)}
                  help={t(`next-prefs-help-${key}`)}
                >
                  {options.length > 3 && (
                    <SelectAllBar
                      total={options.length}
                      selected={draft[key].length}
                      onSelectAll={() =>
                        set({ [key]: options.map((o) => o.value) })
                      }
                      onClear={() => set({ [key]: [] })}
                      t={t}
                    />
                  )}
                  <MeedChipGroup
                    options={options}
                    selected={draft[key]}
                    onChange={(next) =>
                      set({
                        [key]: next as CoBenefitKey[] &
                          RiskCellKey[] &
                          Timeline[],
                      })
                    }
                    ariaLabel={t(`next-prefs-group-${key}`)}
                  />
                </Choice>
              ))}

              {/* Weights: the methodology's defaults, behind a fold. */}
              <Box py="l" borderTopWidth="1px" borderColor="border.overlay">
                <Collapsible.Root
                  open={advancedOpen}
                  onOpenChange={(d) => setAdvancedOpen(d.open)}
                >
                  <Collapsible.Trigger asChild>
                    <Box
                      as="button"
                      w="full"
                      textAlign="start"
                      _focusVisible={FOCUS_RING}
                    >
                      <HStack justifyContent="space-between" gap="s">
                        <HStack gap="s" flexWrap="wrap">
                          <TitleMedium as="span" color="content.primary">
                            {t("next-advanced-title")}
                          </TitleMedium>
                          {isCustomWeights(draft.weights) && (
                            <BodySmall color="content.secondary">
                              {tPre("custom-weights-active")}
                            </BodySmall>
                          )}
                        </HStack>
                        <Icon
                          as={advancedOpen ? LuChevronUp : LuChevronDown}
                          boxSize="16px"
                          color="content.tertiary"
                        />
                      </HStack>
                    </Box>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <VStack alignItems="stretch" gap="s" pt="m">
                      <BodySmall color="content.secondary">
                        {t("next-advanced-note")}
                      </BodySmall>
                      <WeightSliders
                        weights={draft.weights}
                        onChange={(weights) => set({ weights })}
                        t={t}
                        tPre={tPre}
                      />
                    </VStack>
                  </Collapsible.Content>
                </Collapsible.Root>
              </Box>
            </Drawer.Body>

            <Drawer.Footer
              px="xl"
              py="l"
              borderTopWidth="1px"
              borderColor="border.overlay"
              display="flex"
              flexDirection={{ base: "column", sm: "row" }}
              alignItems={{ base: "stretch", sm: "center" }}
              justifyContent="space-between"
              gap="m"
            >
              <VStack alignItems="flex-start" gap="xs">
                <BodySmall color="content.primary" fontWeight="semibold">
                  {count === 0
                    ? t("next-prefs-count-none")
                    : t("next-prefs-count", { count })}
                </BodySmall>
                {!isDefault && (
                  <TextLink
                    arrow={false}
                    muted
                    onClick={() => setDraft({ ...DEFAULT_PRIORITIES })}
                  >
                    {t("next-prefs-clear-all")}
                  </TextLink>
                )}
              </VStack>
              <MeedButton
                minW="auto"
                px="l"
                disabled={!changed}
                onClick={() => onApply(draft)}
                _focusVisible={FOCUS_RING}
                data-testid="update-ranking"
              >
                {t("next-prefs-update")}
              </MeedButton>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
