"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, HStack, Link, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuZap } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedButton } from "../../components/MeedButton";
import { Slider } from "@/components/ui/slider";
import { useGetMeedActionsQuery } from "@/services/api";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MEED_WIZARD_STEPS, getMeedPath } from "../../steps";
import { stepHref } from "../../navigation";
import { useMeedSectionStates, type MeedSectionStates } from "../../meedStatus";
import { computeMeedGate } from "../../meedGate";
import {
  MeedStatusTag,
  STATUS_LABEL_KEY,
  STATUS_TONE,
  type MeedTone,
} from "../../components/MeedStatusTag";
import { MeedMeter } from "../../components/MeedMeter";
import { MeedGateNotice } from "../../components/MeedGateNotice";
import { MeedCardSkeleton } from "../../components/MeedSkeletons";
import {
  DEFAULT_MEED_WEIGHTS,
  getMeedConfirmedExclusions,
  getMeedPreferences,
  setMeedConfirmedExclusions,
  setMeedPreferences,
  setMeedStepState,
  type MeedStrategicPreferences,
} from "../../meedLocalState";
import { buildActionIndex } from "../results/components/actionCatalog";
import {
  computeExclusionMatches,
  toProposedExclusions,
} from "./exclusionProposals";
import { ExclusionPreviewPanel } from "./ExclusionPreviewPanel";
import { FOCUS_RING } from "../../focusRing";

type WeightKey = "impact" | "alignment" | "feasibility";
type Weights = Record<WeightKey, number>;

const WEIGHT_KEYS: WeightKey[] = ["impact", "alignment", "feasibility"];

/** The wizard steps summarized on this screen (everything before pre-flight). */
const SUMMARY_STEPS = MEED_WIZARD_STEPS.filter((s) => s.key !== "preflight");

/**
 * How much each input adds to the model-confidence score, best-value first.
 * The base covers the action library and the emission factors that ship with
 * the model regardless of what the city has entered.
 */
const CONFIDENCE_BASE = 40;
const CONFIDENCE_CAP = 98;
/**
 * Only the two inputs the city supplies move this number. The read-only areas
 * used to carry 33 points between them, which meant confidence rose by a third
 * for opening pages the user could not change.
 */
const CONFIDENCE_POINTS: { key: string; points: number }[] = [
  { key: "emissions", points: 40 },
  { key: "preferences", points: 18 },
];

/** API option keys use snake_case; locale keys are kebab-case. */
function kebab(key: string): string {
  return key.replace(/_/g, "-");
}

/** A section counts towards confidence once its data has stopped moving. */
function isSettled(states: MeedSectionStates, key: string): boolean {
  const status = states[key]?.status;
  return status === "complete" || status === "needs-review";
}

interface Confidence {
  score: number;
  verdict: "low" | "moderate" | "high";
  tone: MeedTone;
  /** Highest-value input the city has not supplied yet, if any. */
  nextBest: { key: string; points: number } | null;
}

function computeConfidence(states: MeedSectionStates): Confidence {
  const earned = CONFIDENCE_POINTS.reduce(
    (sum, entry) => sum + (isSettled(states, entry.key) ? entry.points : 0),
    0,
  );
  const score = Math.min(CONFIDENCE_CAP, CONFIDENCE_BASE + earned);
  const verdict = score < 50 ? "low" : score < 75 ? "moderate" : "high";
  return {
    score,
    verdict,
    tone:
      verdict === "low"
        ? "negative"
        : verdict === "moderate"
          ? "warning"
          : "positive",
    nextBest:
      CONFIDENCE_POINTS.find((entry) => !isSettled(states, entry.key)) ?? null,
  };
}

function emptyPreferences(): MeedStrategicPreferences {
  return {
    sectors: [],
    strategicPriorities: [],
    timeline: [],
    weights: { ...DEFAULT_MEED_WEIGHTS },
    excludedSectors: [],
    excludedCoBenefits: [],
    excludeText: "",
  };
}

function WeightSlider({
  label,
  description,
  value,
  defaultValue,
  onChange,
  t,
}: {
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
  t: TFunction;
}) {
  const isDefault = value === defaultValue;
  return (
    <VStack alignItems="stretch" gap="s">
      <HStack justifyContent="space-between" alignItems="center" gap="s">
        <VStack alignItems="flex-start" gap="0" minW="0" flex="1">
          <LabelLarge color="content.primary">{label}</LabelLarge>
          <Caption color="content.tertiary">{description}</Caption>
        </VStack>
        <TitleMedium
          color={isDefault ? "content.secondary" : "content.link"}
          flexShrink={0}
          fontVariantNumeric="tabular-nums"
        >
          {value}%
        </TitleMedium>
      </HStack>
      <Slider
        value={[value]}
        min={5}
        max={90}
        step={1}
        marks={[defaultValue]}
        aria-label={[label]}
        getAriaValueText={(details: { value: number }) =>
          t("weight-value-text", { value: details.value })
        }
        onValueChange={(details: { value: number[] }) =>
          onChange(details.value[0])
        }
        _focusWithin={FOCUS_RING}
      />
      <HStack justifyContent="space-between" gap="s">
        <Caption color="content.tertiary">5%</Caption>
        <Caption color="content.tertiary" textAlign="center">
          {isDefault
            ? t("weight-default", { value: defaultValue })
            : t("weight-adjusted", { value: defaultValue })}
        </Caption>
        <Caption color="content.tertiary">90%</Caption>
      </HStack>
    </VStack>
  );
}

/** One wizard step in the completeness list. */
function CompletenessRow({
  label,
  status,
  sub,
  href,
  isLast,
  t,
}: {
  label: string;
  status: keyof typeof STATUS_TONE;
  sub?: string;
  href: string;
  isLast: boolean;
  t: TFunction;
}) {
  const isComplete = status === "complete";
  return (
    <HStack
      justifyContent="space-between"
      alignItems="center"
      gap="m"
      py="m"
      borderBottomWidth={isLast ? "0" : "1px"}
      borderColor="border.overlay"
    >
      <VStack alignItems="flex-start" gap="xs" flex="1" minW="0">
        <HStack gap="s" flexWrap="wrap" alignItems="center">
          <LabelLarge color="content.primary">{label}</LabelLarge>
          <MeedStatusTag tone={STATUS_TONE[status]}>
            {t(STATUS_LABEL_KEY[status])}
          </MeedStatusTag>
        </HStack>
        <Caption color="content.tertiary">{sub ?? t("no-detail-yet")}</Caption>
      </VStack>
      <Link
        asChild
        flexShrink={0}
        color="content.link"
        fontFamily="heading"
        fontSize="label.md"
        fontWeight="semibold"
        _focusVisible={FOCUS_RING}
      >
        <NextLink
          href={href}
          aria-label={t(isComplete ? "edit-step-aria" : "enter-data-aria", {
            step: label,
          })}
        >
          {isComplete ? t("edit-step") : t("enter-data")}
        </NextLink>
      </Link>
    </HStack>
  );
}

function PreflightContent(props: {
  lng: string;
  cityId: string;
  inventoryId: string;
}) {
  const { lng, cityId, inventoryId } = props;
  const { t } = useTranslation(lng, "meed-preflight");
  const router = useRouter();

  const { states, isReady } = useMeedSectionStates(inventoryId);

  // Loaded from localStorage after mount to avoid SSR/client hydration drift.
  const [preferences, setPreferences] =
    useState<MeedStrategicPreferences | null>(null);
  const [confirmedExclusions, setConfirmedExclusions] = useState<string[]>([]);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_MEED_WEIGHTS });

  useEffect(() => {
    const prefs = getMeedPreferences(inventoryId);
    setPreferences(prefs);
    setWeights(prefs?.weights ?? { ...DEFAULT_MEED_WEIGHTS });
    setConfirmedExclusions(getMeedConfirmedExclusions(inventoryId));
    setMeedStepState(inventoryId, "preflight", { visited: true });
  }, [inventoryId]);

  const gate = useMemo(() => computeMeedGate(states), [states]);
  const confidence = useMemo(() => computeConfidence(states), [states]);

  // The catalog is what the exclusion criteria are matched against. Five other
  // MEED screens already run this query, and it shares the "Meed" cache tag, so
  // by the time the user reaches pre-flight it is normally already warm.
  const {
    data: catalog,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
  } = useGetMeedActionsQuery({ cityId });
  const actionIndex = useMemo(() => buildActionIndex(catalog), [catalog]);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSelectedIds, setPreviewSelectedIds] = useState<string[]>([]);

  const proposals = useMemo(
    () =>
      preferences == null
        ? []
        : toProposedExclusions(
            computeExclusionMatches(actionIndex, preferences),
            actionIndex,
            t,
          ),
    [actionIndex, preferences, t],
  );

  function openPreview() {
    const proposedIds = proposals.map((proposal) => proposal.actionId);
    // Re-opening must not silently re-tick actions the user rejected last time,
    // so an existing confirmation narrows the seed rather than being ignored.
    setPreviewSelectedIds(
      confirmedExclusions.length > 0
        ? proposedIds.filter((id) => confirmedExclusions.includes(id))
        : proposedIds,
    );
    setIsPreviewOpen(true);
  }

  function togglePreviewSelection(actionId: string) {
    setPreviewSelectedIds((previous) =>
      previous.includes(actionId)
        ? previous.filter((id) => id !== actionId)
        : [...previous, actionId],
    );
  }

  function confirmExclusions() {
    setMeedConfirmedExclusions(inventoryId, previewSelectedIds);
    setConfirmedExclusions(previewSelectedIds);
    setIsPreviewOpen(false);
  }

  function clearExclusions() {
    setMeedConfirmedExclusions(inventoryId, []);
    setConfirmedExclusions([]);
  }

  function persistWeights(next: Weights) {
    const existing = getMeedPreferences(inventoryId) ?? emptyPreferences();
    setMeedPreferences(inventoryId, { ...existing, weights: next });
  }

  /**
   * Move one slider and redistribute the remainder proportionally across the
   * other two pillars so the total always stays at 100.
   */
  function handleWeightChange(key: WeightKey, rawValue: number) {
    const newValue = Math.min(90, Math.max(5, Math.round(rawValue)));
    const others = WEIGHT_KEYS.filter((k) => k !== key);
    const remaining = 100 - newValue;
    const currentOtherSum = weights[others[0]] + weights[others[1]];

    let first: number;
    if (currentOtherSum === 0) {
      first = Math.floor(remaining / 2);
    } else {
      first = Math.round((remaining * weights[others[0]]) / currentOtherSum);
      first = Math.max(5, Math.min(first, remaining - 5));
    }
    const next: Weights = {
      ...weights,
      [key]: newValue,
      [others[0]]: first,
      [others[1]]: remaining - first,
    };
    setWeights(next);
    persistWeights(next);
  }

  function resetWeights() {
    const next = { ...DEFAULT_MEED_WEIGHTS };
    setWeights(next);
    persistWeights(next);
  }

  const isCustomWeights = WEIGHT_KEYS.some(
    (k) => weights[k] !== DEFAULT_MEED_WEIGHTS[k],
  );
  const totalWeight = WEIGHT_KEYS.reduce((sum, k) => sum + weights[k], 0);
  const totalIsValid = totalWeight === 100;

  const hasExclusionCriteria =
    preferences != null &&
    (preferences.excludedSectors.length > 0 ||
      preferences.excludedCoBenefits.length > 0 ||
      preferences.excludeText.trim().length > 0);

  /**
   * Only sector and co-benefit criteria can be resolved here. Free text is
   * matched upstream by an LLM when the ranking runs, so a free-text-only
   * criterion cannot produce a preview — hence a separate flag from
   * `hasExclusionCriteria`, which the summary above still uses.
   */
  const hasStructuralExclusionCriteria =
    preferences != null &&
    (preferences.excludedSectors.length > 0 ||
      preferences.excludedCoBenefits.length > 0);

  const hasFreeTextCriterion =
    preferences != null && preferences.excludeText.trim().length > 0;

  const previewHintKey = !hasStructuralExclusionCriteria
    ? "preview-exclusions-hint"
    : hasFreeTextCriterion
      ? "preview-free-text-note"
      : null;

  function generateRanking() {
    setMeedStepState(inventoryId, "preflight", {
      visited: true,
      confirmed: true,
    });
    router.push(getMeedPath(lng, cityId, inventoryId, "processing"));
  }

  return (
    <VStack alignItems="stretch" gap="l">
      <BodyLarge color="content.secondary">{t("description")}</BodyLarge>

      <SimpleGrid
        columns={{ base: 1, lg: 2 }}
        gridTemplateColumns={{ lg: "1fr 380px" }}
        alignItems="start"
        gap="l"
      >
        {/* Left — what the model has to work with. */}
        <VStack alignItems="stretch" gap="l">
          {isReady ? (
            <Card.Root borderColor="border.overlay">
              <Card.Body>
                <VStack alignItems="stretch" gap="s">
                  <TitleMedium color="content.primary">
                    {t("data-completeness-title")}
                  </TitleMedium>
                  <VStack alignItems="stretch" gap="0">
                    {SUMMARY_STEPS.map((step, index) => (
                      <CompletenessRow
                        key={step.key}
                        label={t(`step-${step.key}`)}
                        status={states[step.key]?.status ?? "not-started"}
                        sub={states[step.key]?.sub}
                        href={stepHref(
                          lng,
                          cityId,
                          inventoryId,
                          step.segment,
                          "preflight",
                        )}
                        isLast={index === SUMMARY_STEPS.length - 1}
                        t={t}
                      />
                    ))}
                  </VStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          ) : (
            <MeedCardSkeleton lines={6} />
          )}

          {/* Confirmed exclusions */}
          <Card.Root borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="stretch" gap="m">
                <TitleMedium color="content.primary">
                  {t("exclusions-title")}
                </TitleMedium>

                {hasExclusionCriteria ? (
                  <VStack alignItems="stretch" gap="s">
                    <VStack alignItems="stretch" gap="xs">
                      <LabelMedium color="content.secondary">
                        {t("excluded-sectors-label")}
                      </LabelMedium>
                      <BodySmall color="content.secondary">
                        {preferences!.excludedSectors.length > 0
                          ? preferences!.excludedSectors
                              .map((s) => t(`sector-${kebab(s)}`))
                              .join(", ")
                          : t("none")}
                      </BodySmall>
                    </VStack>
                    <VStack alignItems="stretch" gap="xs">
                      <LabelMedium color="content.secondary">
                        {t("excluded-co-benefits-label")}
                      </LabelMedium>
                      <BodySmall color="content.secondary">
                        {preferences!.excludedCoBenefits.length > 0
                          ? preferences!.excludedCoBenefits
                              .map((k) => t(`co-benefit-${kebab(k)}`))
                              .join(", ")
                          : t("none")}
                      </BodySmall>
                    </VStack>
                    <VStack alignItems="stretch" gap="xs">
                      <LabelMedium color="content.secondary">
                        {t("excluded-free-text-label")}
                      </LabelMedium>
                      <BodySmall color="content.secondary">
                        {preferences!.excludeText.trim() || t("none")}
                      </BodySmall>
                    </VStack>
                  </VStack>
                ) : (
                  <BodySmall color="content.tertiary" fontStyle="italic">
                    {t("no-exclusion-criteria")}
                  </BodySmall>
                )}

                <VStack alignItems="stretch" gap="xs">
                  <HStack gap="s" flexWrap="wrap">
                    <MeedButton
                      variant="outlined"
                      minW="auto"
                      px="l"
                      disabled={
                        !hasStructuralExclusionCriteria || isPreviewOpen
                      }
                      aria-describedby={
                        previewHintKey
                          ? "meed-exclusion-preview-hint"
                          : undefined
                      }
                      onClick={openPreview}
                      _focusVisible={FOCUS_RING}
                    >
                      {t("preview-exclusions-cta")}
                    </MeedButton>
                    {confirmedExclusions.length > 0 && (
                      <MeedButton
                        variant="text"
                        minW="auto"
                        px="m"
                        onClick={clearExclusions}
                        _focusVisible={FOCUS_RING}
                      >
                        {t("clear-confirmed-exclusions")}
                      </MeedButton>
                    )}
                  </HStack>
                  {/* The gate explains itself next to the button it disables. */}
                  {previewHintKey && (
                    <Caption
                      id="meed-exclusion-preview-hint"
                      color="content.tertiary"
                    >
                      {t(previewHintKey)}
                    </Caption>
                  )}
                </VStack>

                {isPreviewOpen && (
                  <ExclusionPreviewPanel
                    proposals={proposals}
                    selectedIds={previewSelectedIds}
                    onToggle={togglePreviewSelection}
                    onSelectAll={() =>
                      setPreviewSelectedIds(proposals.map((p) => p.actionId))
                    }
                    onDeselectAll={() => setPreviewSelectedIds([])}
                    onConfirm={confirmExclusions}
                    onCancel={() => setIsPreviewOpen(false)}
                    isLoading={isCatalogLoading}
                    isError={isCatalogError}
                    t={t}
                  />
                )}

                {confirmedExclusions.length > 0 ? (
                  <BodySmall color="content.secondary">
                    {t("confirmed-exclusions-count", {
                      count: confirmedExclusions.length,
                    })}
                  </BodySmall>
                ) : (
                  <BodySmall color="content.tertiary">
                    {t("no-confirmed-exclusions")}
                  </BodySmall>
                )}

                <Caption color="content.tertiary">
                  {t("legal-screening-note")}
                </Caption>

                <Link
                  asChild
                  alignSelf="flex-start"
                  color="content.link"
                  fontFamily="heading"
                  fontSize="label.md"
                  fontWeight="semibold"
                  _focusVisible={FOCUS_RING}
                >
                  <NextLink
                    href={stepHref(
                      lng,
                      cityId,
                      inventoryId,
                      "preferences",
                      "preflight",
                    )}
                  >
                    {t("edit-exclusion-criteria")}
                  </NextLink>
                </Link>
              </VStack>
            </Card.Body>
          </Card.Root>
        </VStack>

        {/* Right — how confident the model is, and how it is weighted. */}
        <VStack alignItems="stretch" gap="l">
          {isReady ? (
            <Card.Root borderColor="border.overlay">
              <Card.Body>
                <VStack alignItems="stretch" gap="s">
                  <TitleMedium color="content.primary">
                    {t("confidence-title")}
                  </TitleMedium>
                  <HStack alignItems="baseline" gap="s">
                    <TitleLarge
                      color="content.primary"
                      fontSize="40px"
                      lineHeight="44px"
                      fontVariantNumeric="tabular-nums"
                    >
                      {confidence.score}
                    </TitleLarge>
                    <BodyMedium color="content.tertiary">
                      {t("confidence-out-of")}
                    </BodyMedium>
                    <MeedStatusTag tone={confidence.tone} ml="auto">
                      {t(`confidence-verdict-${confidence.verdict}`)}
                    </MeedStatusTag>
                  </HStack>
                  <MeedMeter
                    value={confidence.score / 100}
                    tone={confidence.tone}
                    ariaLabel={t("confidence-aria", {
                      score: confidence.score,
                    })}
                  />
                  <BodySmall color="content.secondary">
                    {t("confidence-description")}
                  </BodySmall>
                  {confidence.verdict !== "high" && confidence.nextBest && (
                    <BodySmall color="sentiment.warningDefault">
                      {t("confidence-hint", {
                        step: t(`step-${confidence.nextBest.key}`),
                        points: confidence.nextBest.points,
                      })}
                    </BodySmall>
                  )}
                </VStack>
              </Card.Body>
            </Card.Root>
          ) : (
            <MeedCardSkeleton lines={3} />
          )}

          {/* Scoring weights */}
          <Card.Root borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="stretch" gap="m">
                <HStack gap="s" alignItems="center" flexWrap="wrap">
                  <TitleMedium color="content.primary">
                    {t("scoring-weights-title")}
                  </TitleMedium>
                  {isCustomWeights && (
                    <MeedStatusTag tone="warning">
                      {t("custom-weights-active")}
                    </MeedStatusTag>
                  )}
                  <MeedStatusTag tone="neutral" ml="auto">
                    {t("badge-optional")}
                  </MeedStatusTag>
                </HStack>
                <VStack alignItems="stretch" gap="xs">
                  <BodySmall color="content.secondary">
                    {t("scoring-weights-description")}
                  </BodySmall>
                  <Caption color="content.tertiary">
                    {t("scoring-weights-defaults", {
                      impact: DEFAULT_MEED_WEIGHTS.impact,
                      alignment: DEFAULT_MEED_WEIGHTS.alignment,
                      feasibility: DEFAULT_MEED_WEIGHTS.feasibility,
                    })}
                  </Caption>
                </VStack>
                <VStack alignItems="stretch" gap="l">
                  {WEIGHT_KEYS.map((key) => (
                    <WeightSlider
                      key={key}
                      label={t(`weight-${key}`)}
                      description={t(`weight-${key}-description`)}
                      value={weights[key]}
                      defaultValue={DEFAULT_MEED_WEIGHTS[key]}
                      onChange={(v) => handleWeightChange(key, v)}
                      t={t}
                    />
                  ))}
                </VStack>
                <HStack gap="s" flexWrap="wrap" alignItems="center">
                  <MeedStatusTag
                    tone={totalIsValid ? "positive" : "negative"}
                    aria-live="polite"
                  >
                    {t("weights-total", { total: totalWeight })}
                  </MeedStatusTag>
                  {isCustomWeights && (
                    <MeedButton
                      variant="text"
                      minW="auto"
                      px="m"
                      onClick={resetWeights}
                      _focusVisible={FOCUS_RING}
                    >
                      {t("reset-to-defaults")}
                    </MeedButton>
                  )}
                </HStack>
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* Generate ranking CTA */}
          <Card.Root borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="stretch" gap="m">
                <MeedGateNotice
                  gate={gate}
                  lng={lng}
                  cityId={cityId}
                  inventoryId={inventoryId}
                  from="preflight"
                  id="meed-preflight-gate"
                />
                {/*
                 * Full width rather than auto: this is the primary action of
                 * the whole flow, and in a 380px column an auto-width button
                 * with a long label overflowed the card instead of wrapping.
                 */}
                <MeedButton
                  variant="filled"
                  minW="auto"
                  w="full"
                  px="l"
                  leftIcon={<LuZap size={16} />}
                  disabled={!gate.canGenerate}
                  aria-describedby="meed-preflight-gate"
                  onClick={generateRanking}
                  _focusVisible={FOCUS_RING}
                >
                  {t("generate-ranking-cta")}
                </MeedButton>
              </VStack>
            </Card.Body>
          </Card.Root>
        </VStack>
      </SimpleGrid>
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="preflight">
      <PreflightContent lng={lng} cityId={cityId} inventoryId={inventoryId} />
    </MeedWizardPage>
  );
}
