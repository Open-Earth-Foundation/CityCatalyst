"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  HStack,
  SimpleGrid,
  Tag,
  VStack,
} from "@chakra-ui/react";
import { LuZap } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge } from "@/components/package/Texts/Label";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { Slider } from "@/components/ui/slider";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MEED_WIZARD_STEPS, getMeedPath } from "../../steps";
import {
  DEFAULT_MEED_WEIGHTS,
  getMeedConfirmedExclusions,
  getMeedPreferences,
  setMeedPreferences,
  setMeedStepState,
  getMeedStepState,
  type MeedStepState,
  type MeedStrategicPreferences,
} from "../../meedLocalState";

type WeightKey = "impact" | "alignment" | "feasibility";
type Weights = Record<WeightKey, number>;

type StepStatus = "complete" | "in-progress" | "not-started";

const WEIGHT_KEYS: WeightKey[] = ["impact", "alignment", "feasibility"];

/** The wizard steps summarized on this screen (everything before pre-flight). */
const SUMMARY_STEPS = MEED_WIZARD_STEPS.filter((s) => s.key !== "preflight");

/** API option keys use snake_case; locale keys are kebab-case. */
function kebab(key: string): string {
  return key.replace(/_/g, "-");
}

function stepStatus(state: MeedStepState): StepStatus {
  if (state.confirmed || (state.progress ?? 0) >= 100) return "complete";
  if (state.visited) return "in-progress";
  return "not-started";
}

const STATUS_PALETTE: Record<StepStatus, string> = {
  complete: "green",
  "in-progress": "orange",
  "not-started": "gray",
};

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
    <VStack alignItems="stretch" gap="8px">
      <HStack justifyContent="space-between" alignItems="baseline">
        <VStack alignItems="flex-start" gap="0">
          <LabelLarge color="content.primary">{label}</LabelLarge>
          <BodyMedium fontSize="xs" color="content.tertiary">
            {description}
          </BodyMedium>
        </VStack>
        <TitleMedium
          color={isDefault ? "content.secondary" : "content.link"}
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
        onValueChange={(details: { value: number[] }) =>
          onChange(details.value[0])
        }
      />
      <HStack justifyContent="space-between">
        <BodyMedium fontSize="xs" color="content.tertiary">
          5%
        </BodyMedium>
        <BodyMedium fontSize="xs" color="content.tertiary">
          {isDefault
            ? t("weight-default", { value: defaultValue })
            : t("weight-adjusted", { value: defaultValue })}
        </BodyMedium>
        <BodyMedium fontSize="xs" color="content.tertiary">
          90%
        </BodyMedium>
      </HStack>
    </VStack>
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

  // Loaded from localStorage after mount to avoid SSR/client hydration drift.
  const [stepStates, setStepStates] = useState<Record<string, MeedStepState>>(
    {},
  );
  const [preferences, setPreferences] =
    useState<MeedStrategicPreferences | null>(null);
  const [confirmedExclusions, setConfirmedExclusions] = useState<string[]>([]);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_MEED_WEIGHTS });

  useEffect(() => {
    const states: Record<string, MeedStepState> = {};
    MEED_WIZARD_STEPS.forEach((step) => {
      states[step.key] = getMeedStepState(inventoryId, step.key);
    });
    setStepStates(states);
    const prefs = getMeedPreferences(inventoryId);
    setPreferences(prefs);
    setWeights(prefs?.weights ?? { ...DEFAULT_MEED_WEIGHTS });
    setConfirmedExclusions(getMeedConfirmedExclusions(inventoryId));
    setMeedStepState(inventoryId, "preflight", { visited: true });
  }, [inventoryId]);

  function persistWeights(next: Weights) {
    const existing = getMeedPreferences(inventoryId) ?? emptyPreferences();
    setMeedPreferences(inventoryId, { ...existing, weights: next });
  }

  /**
   * Move one slider and redistribute the remainder proportionally across the
   * other two pillars so the total always stays at 100 (prototype behavior).
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

  const hasExclusionCriteria =
    preferences != null &&
    (preferences.excludedSectors.length > 0 ||
      preferences.excludedCoBenefits.length > 0 ||
      preferences.excludeText.trim().length > 0);

  function generateRanking() {
    setMeedStepState(inventoryId, "preflight", {
      visited: true,
      confirmed: true,
    });
    router.push(getMeedPath(lng, cityId, inventoryId, "processing"));
  }

  return (
    <VStack alignItems="stretch" gap="24px">
      <BodyLarge color="content.secondary">{t("description")}</BodyLarge>

      {/* Data completeness per wizard step */}
      <Card.Root>
        <Card.Body>
          <VStack alignItems="stretch" gap="12px">
            <TitleMedium color="content.primary">
              {t("data-completeness-title")}
            </TitleMedium>
            <VStack alignItems="stretch" gap="0">
              {SUMMARY_STEPS.map((step, index) => {
                const status = stepStatus(stepStates[step.key] ?? {});
                return (
                  <HStack
                    key={step.key}
                    justifyContent="space-between"
                    py="12px"
                    borderBottomWidth={
                      index < SUMMARY_STEPS.length - 1 ? "1px" : "0"
                    }
                    borderColor="divider.neutral"
                  >
                    <VStack alignItems="flex-start" gap="4px">
                      <LabelLarge color="content.primary">
                        {t(`step-${step.key}`)}
                      </LabelLarge>
                      <Tag.Root
                        size="sm"
                        colorPalette={STATUS_PALETTE[status]}
                      >
                        <Tag.Label>{t(`status-${status}`)}</Tag.Label>
                      </Tag.Root>
                    </VStack>
                    <CCTerraButton
                      variant="text"
                      onClick={() =>
                        router.push(
                          getMeedPath(lng, cityId, inventoryId, step.segment),
                        )
                      }
                    >
                      {status === "complete" ? t("edit-step") : t("enter-data")}
                    </CCTerraButton>
                  </HStack>
                );
              })}
            </VStack>
          </VStack>
        </Card.Body>
      </Card.Root>

      {/* Scoring weights */}
      <Card.Root>
        <Card.Body>
          <VStack alignItems="stretch" gap="16px">
            <HStack gap="10px">
              <TitleMedium color="content.primary">
                {t("scoring-weights-title")}
              </TitleMedium>
              {isCustomWeights && (
                <Tag.Root size="sm" colorPalette="orange">
                  <Tag.Label>{t("custom-weights-active")}</Tag.Label>
                </Tag.Root>
              )}
              <Tag.Root size="sm" colorPalette="blue" ml="auto">
                <Tag.Label>{t("badge-optional")}</Tag.Label>
              </Tag.Root>
            </HStack>
            <VStack alignItems="stretch" gap="4px">
              <BodyMedium color="content.secondary">
                {t("scoring-weights-description")}
              </BodyMedium>
              <BodyMedium fontSize="xs" color="content.tertiary">
                {t("scoring-weights-defaults", {
                  impact: DEFAULT_MEED_WEIGHTS.impact,
                  alignment: DEFAULT_MEED_WEIGHTS.alignment,
                  feasibility: DEFAULT_MEED_WEIGHTS.feasibility,
                })}
              </BodyMedium>
            </VStack>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="24px">
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
            </SimpleGrid>
            <HStack gap="10px">
              <Box
                px="12px"
                py="4px"
                borderRadius="6px"
                bg="background.neutral"
              >
                <LabelLarge color="sentiment.positiveDefault">
                  {t("weights-total", { total: totalWeight })}
                </LabelLarge>
              </Box>
              {isCustomWeights && (
                <CCTerraButton variant="outlined" onClick={resetWeights}>
                  {t("reset-to-defaults")}
                </CCTerraButton>
              )}
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>

      {/* Confirmed exclusions */}
      <Card.Root>
        <Card.Body>
          <VStack alignItems="stretch" gap="12px">
            <TitleMedium color="content.primary">
              {t("exclusions-title")}
            </TitleMedium>

            {hasExclusionCriteria ? (
              <Box
                borderWidth="1px"
                borderColor="divider.neutral"
                borderRadius="8px"
                bg="background.neutral"
                px="16px"
                py="14px"
              >
                <VStack alignItems="stretch" gap="6px">
                  <BodyMedium color="content.secondary">
                    <strong>{t("excluded-sectors-label")}</strong>{" "}
                    {preferences!.excludedSectors.length > 0
                      ? preferences!.excludedSectors
                          .map((s) => t(`sector-${kebab(s)}`))
                          .join(", ")
                      : t("none")}
                  </BodyMedium>
                  <BodyMedium color="content.secondary">
                    <strong>{t("excluded-co-benefits-label")}</strong>{" "}
                    {preferences!.excludedCoBenefits.length > 0
                      ? preferences!.excludedCoBenefits
                          .map((k) => t(`co-benefit-${kebab(k)}`))
                          .join(", ")
                      : t("none")}
                  </BodyMedium>
                  <BodyMedium color="content.secondary">
                    <strong>{t("excluded-free-text-label")}</strong>{" "}
                    {preferences!.excludeText.trim() || t("none")}
                  </BodyMedium>
                </VStack>
              </Box>
            ) : (
              <BodyMedium color="content.tertiary" fontStyle="italic">
                {t("no-exclusion-criteria")}
              </BodyMedium>
            )}

            {confirmedExclusions.length > 0 ? (
              <BodyMedium color="content.secondary">
                {t("confirmed-exclusions-count", {
                  count: confirmedExclusions.length,
                })}
              </BodyMedium>
            ) : (
              <BodyMedium color="content.tertiary">
                {t("no-confirmed-exclusions")}
              </BodyMedium>
            )}

            <BodyMedium fontSize="xs" color="content.tertiary">
              {t("legal-screening-note")}
            </BodyMedium>

            <CCTerraButton
              variant="text"
              alignSelf="flex-start"
              onClick={() =>
                router.push(
                  getMeedPath(lng, cityId, inventoryId, "preferences"),
                )
              }
            >
              {t("edit-exclusion-criteria")}
            </CCTerraButton>
          </VStack>
        </Card.Body>
      </Card.Root>

      {/* Generate ranking CTA */}
      <CCTerraButton variant="filled" w="full" py="24px" onClick={generateRanking}>
        <HStack gap="10px">
          <LuZap size={16} />
          {t("generate-ranking-cta")}
        </HStack>
      </CCTerraButton>
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
