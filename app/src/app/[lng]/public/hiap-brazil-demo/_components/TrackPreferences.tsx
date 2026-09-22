"use client";
import React from "react";
import {
  Card,
  Checkbox,
  HStack,
  Icon,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import { LuTarget } from "react-icons/lu";
import type { TFunction } from "i18next";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedChipGroup } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedChipGroup";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type {
  CoBenefitKey,
  DemoTrack,
  RiskCellKey,
  Timeline,
} from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { useLabels } from "../_lib/useLabels";
import { SCREEN_IDS, trackHref } from "../_lib/hrefs";
import { ADAPTA_SECTORS, RISK_CELLS } from "../_lib/riskCells";
import { CO_BENEFIT_KEYS } from "../_lib/coBenefits";
import { ADAPTATION_ACTIONS } from "../_lib/actions";
import { pick } from "../_lib/localized";
import { DemoShell } from "./DemoShell";

const TIMELINES: Timeline[] = ["<5 years", "5-10 years", ">10 years"];

function CheckCard({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={(d) => onChange(!!d.checked)}
      w="full"
      alignItems="flex-start"
      gap="m"
      px="m"
      py="m"
      borderRadius="rounded"
      borderWidth="1px"
      borderColor={checked ? "content.link" : "border.neutral"}
      bg={checked ? "background.neutral" : "base.light"}
      cursor="pointer"
      textAlign="left"
      _hover={{ borderColor: "content.link" }}
      _focusWithin={FOCUS_RING}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control
        boxSize="18px"
        mt="xs"
        flexShrink={0}
        borderWidth="2px"
        borderRadius="minimal"
        borderColor="border.neutral"
        bg="base.light"
        _checked={{
          bg: "content.link",
          borderColor: "content.link",
          color: "base.light",
        }}
      >
        <Checkbox.Indicator />
      </Checkbox.Control>
      <VStack alignItems="flex-start" gap="xs" minW="0">
        <Checkbox.Label
          fontFamily="heading"
          fontSize="label.lg"
          fontWeight={checked ? "semibold" : "medium"}
          color={checked ? "content.link" : "content.secondary"}
          cursor="pointer"
        >
          {label}
        </Checkbox.Label>
        {sublabel && <BodySmall color="content.tertiary">{sublabel}</BodySmall>}
      </VStack>
    </Checkbox.Root>
  );
}

function Section({
  title,
  badge,
  badgeTone = "info",
  t,
  required,
  children,
}: {
  title: string;
  badge?: string;
  badgeTone?: MeedTone;
  t: TFunction;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card.Root borderColor="border.overlay">
      <Card.Body>
        <VStack alignItems="stretch" gap="m">
          <HStack gap="s" alignItems="center" flexWrap="wrap">
            <TitleMedium color="content.primary">{title}</TitleMedium>
            {required && (
              <LabelMedium color="content.tertiary">
                {t("required")}
              </LabelMedium>
            )}
            {badge && (
              <MeedStatusTag tone={badgeTone} ml="auto">
                {badge}
              </MeedStatusTag>
            )}
          </HStack>
          {children}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

/**
 * BR-A3 / BR-M3 — strategic preferences. Per the Sep 4 decision, co-benefits
 * and timeline are shared between the two tracks and sector / risk selection
 * and exclusions are track-specific. Every change writes straight to the
 * browser; the footer owns forward navigation.
 */
export function TrackPreferences({
  lng,
  citySlug,
  track,
}: {
  lng: string;
  citySlug: string;
  track: DemoTrack;
}) {
  const { city, state, setPreferences, isReady } = useTrack(
    lng,
    citySlug,
    track,
  );
  const { t } = useDemoT(lng);
  const tPrefs = useTrackT(lng, track, "meed-preferences");
  const labels = useLabels(lng, track);
  const prefs = state.preferences;
  const screenId =
    track === "adaptation"
      ? SCREEN_IDS.adaptation.preferences
      : SCREEN_IDS.mitigation.preferences;

  const sectorOptions = (
    track === "adaptation" ? ADAPTA_SECTORS : labels.gpcSectors
  ).map((key) => ({
    value: key,
    label: labels.sector(key),
  }));
  const riskOptions = RISK_CELLS.map((c) => ({
    value: c.key,
    label: pick(c.label, lng),
  }));
  const excludable = ADAPTATION_ACTIONS.filter((a) => a.kind === "direct");

  const toggle = <T extends string>(list: T[], value: T, on: boolean): T[] =>
    on
      ? [...list.filter((v) => v !== value), value]
      : list.filter((v) => v !== value);

  return (
    <DemoShell
      lng={lng}
      city={city}
      track={track}
      segment="preferences"
      screenId={screenId}
      title={tPrefs("title")}
      step="preferences"
      stepsDone={{
        preferences: Boolean(state.visited.preferences),
        preflight: Boolean(state.visited.preflight),
      }}
      forward={{
        href: trackHref(lng, city.slug, track, "preflight"),
        label: t("step-preflight"),
      }}
      openPoints={
        track === "adaptation"
          ? [t("open-prefs-risks")]
          : [t("open-mitigation-review")]
      }
    >
      {!isReady ? null : (
        <VStack alignItems="stretch" gap="l">
          <VStack alignItems="stretch" gap="s">
            <BodyLarge color="content.secondary">
              {tPrefs("description")}
            </BodyLarge>
            {/* The product no longer prints weights the ranking did not
                report; the adaptation methodology fixes its weights, so the
                note stays there and only there. */}
            {track === "adaptation" && (
              <HStack
                gap="s"
                px="m"
                py="s"
                borderRadius="rounded"
                bg="background.neutral"
                alignItems="flex-start"
                alignSelf="flex-start"
              >
                <Icon as={LuTarget} boxSize="16px" color="content.link" />
                <Caption color="content.secondary">
                  {tPrefs("alignment-note")}
                </Caption>
              </HStack>
            )}
          </VStack>

          {/* Shared: co-benefits */}
          <Section
            title={tPrefs("strategic-priorities-title")}
            badge={t("badge-shared")}
            badgeTone="neutral"
            t={tPrefs}
          >
            <BodyMedium color="content.secondary">
              {tPrefs("strategic-priorities-description")}
            </BodyMedium>
            <SimpleGrid
              columns={{ base: 1, md: 2 }}
              gap="s"
              role="group"
              aria-label={tPrefs("aria-strategic-priorities")}
            >
              {CO_BENEFIT_KEYS.map((key) => (
                <CheckCard
                  key={key}
                  label={labels.coBenefit(key)}
                  checked={prefs.coBenefits.includes(key)}
                  onChange={(on) =>
                    setPreferences({
                      coBenefits: toggle<CoBenefitKey>(
                        prefs.coBenefits,
                        key,
                        on,
                      ),
                    })
                  }
                />
              ))}
            </SimpleGrid>
            {prefs.coBenefits.length > 0 && (
              <BodySmall color="interactive.tertiary" aria-live="polite">
                {tPrefs("co-benefits-selected", {
                  count: prefs.coBenefits.length,
                })}
              </BodySmall>
            )}
          </Section>

          {/* Shared: timeline */}
          <Section
            title={tPrefs("timeline-title")}
            badge={t("badge-shared")}
            badgeTone="neutral"
            t={tPrefs}
          >
            <BodyMedium color="content.secondary">
              {tPrefs("timeline-description")}
            </BodyMedium>
            <VStack
              alignItems="stretch"
              gap="s"
              role="group"
              aria-label={tPrefs("aria-timeline")}
            >
              {TIMELINES.map((key) => {
                const k =
                  key === "<5 years"
                    ? "short"
                    : key === "5-10 years"
                      ? "medium"
                      : "long";
                return (
                  <CheckCard
                    key={key}
                    label={tPrefs(`timeline-${k}`)}
                    sublabel={tPrefs(`timeline-${k}-sub`)}
                    checked={prefs.timeline.includes(key)}
                    onChange={(on) =>
                      setPreferences({
                        timeline: toggle<Timeline>(prefs.timeline, key, on),
                      })
                    }
                  />
                );
              })}
            </VStack>
            <BodySmall color="content.tertiary">
              {t("timeline-two-uses-note")}
            </BodySmall>
          </Section>

          {/* Track-specific: sectors. A preference, not a model input the
              ranking cannot run without — so never marked required. */}
          <Section
            title={tPrefs("priority-sectors-title")}
            badge={t(`badge-${track}`)}
            t={tPrefs}
          >
            <BodyMedium color="content.secondary">
              {tPrefs("priority-sectors-description")}
            </BodyMedium>
            <MeedChipGroup
              options={sectorOptions}
              selected={prefs.sectors}
              onChange={(next) => setPreferences({ sectors: next })}
              ariaLabel={tPrefs("aria-priority-sectors")}
            />
            {prefs.sectors.length > 0 && (
              <BodySmall color="interactive.tertiary" aria-live="polite">
                {tPrefs("sectors-selected", { count: prefs.sectors.length })}
              </BodySmall>
            )}
          </Section>

          {/* Adaptation only: priority risks (pending lever) */}
          {track === "adaptation" && (
            <Section
              title={t("priority-risks-title")}
              badge={t("badge-pending")}
              badgeTone="warning"
              t={tPrefs}
            >
              <BodyMedium color="content.secondary">
                {t("priority-risks-description")}
              </BodyMedium>
              <MeedChipGroup
                options={riskOptions}
                selected={prefs.priorityRisks}
                onChange={(next) =>
                  setPreferences({ priorityRisks: next as RiskCellKey[] })
                }
                ariaLabel={t("priority-risks-title")}
              />
            </Section>
          )}

          {/* Exclusions */}
          <Section
            title={tPrefs("exclusions-title")}
            badge={tPrefs("badge-optional")}
            badgeTone="neutral"
            t={tPrefs}
          >
            <BodyMedium color="content.secondary">
              {t("exclusions-description")}
            </BodyMedium>
            {track === "adaptation" ? (
              <SimpleGrid
                columns={{ base: 1, md: 2 }}
                gap="s"
                role="group"
                aria-label={tPrefs("exclusions-title")}
              >
                {excludable.map((a) => (
                  <CheckCard
                    key={a.id}
                    label={pick(a.name, lng)}
                    sublabel={labels.sector(a.sector)}
                    checked={prefs.excludedActionIds.includes(a.id)}
                    onChange={(on) =>
                      setPreferences({
                        excludedActionIds: toggle(
                          prefs.excludedActionIds,
                          a.id,
                          on,
                        ),
                      })
                    }
                  />
                ))}
              </SimpleGrid>
            ) : (
              <BodySmall color="content.tertiary">
                {t("exclusions-mitigation-note")}
              </BodySmall>
            )}
            {prefs.excludedActionIds.length > 0 ? (
              <BodySmall color="interactive.tertiary" aria-live="polite">
                {t("exclusions-count", {
                  count: prefs.excludedActionIds.length,
                })}
              </BodySmall>
            ) : (
              <BodySmall color="content.tertiary">
                {tPrefs("no-exclusions-set")}
              </BodySmall>
            )}
          </Section>
        </VStack>
      )}
    </DemoShell>
  );
}
