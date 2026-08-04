"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  HStack,
  SimpleGrid,
  Tag,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge } from "@/components/package/Texts/Label";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import type { MeedTimeframePreference } from "@/util/types/meed";
import { MeedWizardPage } from "../../MeedWizardPage";
import { getMeedPath } from "../../steps";
import {
  DEFAULT_MEED_WEIGHTS,
  getMeedPreferences,
  setMeedPreferences,
  setMeedStepState,
} from "../../meedLocalState";

/** Sector tags as validated by the MEED exclusion/prioritize endpoints. */
const SECTOR_KEYS = [
  "stationary_energy",
  "transportation",
  "waste",
  "ippu",
  "afolu",
] as const;

/** Co-benefit keys as used by the MEED prioritizer. */
const CO_BENEFIT_KEYS = [
  "air_quality",
  "water_quality",
  "habitat",
  "housing",
  "stakeholder_engagement",
  "cost_of_living",
  "mobility",
] as const;

const TIMELINE_KEYS: MeedTimeframePreference[] = [
  "short",
  "medium",
  "long",
  "no_preference",
];

/** API option keys use snake_case; locale keys are kebab-case. */
function kebab(key: string): string {
  return key.replace(/_/g, "-");
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/** Pill-shaped multi-select chip. */
function SelectableChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      as="button"
      onClick={onToggle}
      px="16px"
      py="8px"
      borderRadius="full"
      borderWidth="1px"
      borderColor={selected ? "content.link" : "divider.neutral"}
      bg={selected ? "content.link" : "base.light"}
      cursor="pointer"
      transition="all 0.12s"
    >
      <BodyMedium
        color={selected ? "base.light" : "content.secondary"}
        fontWeight={selected ? "semibold" : "normal"}
      >
        {label}
      </BodyMedium>
    </Box>
  );
}

/** Checkbox-style multi-select row. */
function CheckOption({
  label,
  sublabel,
  selected,
  onToggle,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <HStack
      as="button"
      onClick={onToggle}
      gap="12px"
      px="16px"
      py="12px"
      borderRadius="8px"
      borderWidth="1px"
      borderColor={selected ? "content.link" : "divider.neutral"}
      bg={selected ? "background.neutral" : "base.light"}
      cursor="pointer"
      textAlign="left"
      transition="all 0.12s"
      alignItems="flex-start"
      w="full"
    >
      <Box
        w="16px"
        h="16px"
        mt="2px"
        borderRadius="4px"
        borderWidth={selected ? "0" : "1px"}
        borderColor="divider.neutral"
        bg={selected ? "content.link" : "base.light"}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
        color="base.light"
      >
        {selected && <LuCheck size={12} />}
      </Box>
      <VStack alignItems="flex-start" gap="0">
        <BodyMedium
          color={selected ? "content.link" : "content.secondary"}
          fontWeight={selected ? "semibold" : "normal"}
        >
          {label}
        </BodyMedium>
        {sublabel && (
          <BodyMedium fontSize="xs" color="content.tertiary">
            {sublabel}
          </BodyMedium>
        )}
      </VStack>
    </HStack>
  );
}

/** Card section with a title, optional required marker and weight badge. */
function Section({
  title,
  required,
  badge,
  t,
  children,
}: {
  title: string;
  required?: boolean;
  badge?: string;
  t: TFunction;
  children: React.ReactNode;
}) {
  return (
    <Card.Root>
      <Card.Body>
        <VStack alignItems="stretch" gap="12px">
          <HStack gap="10px">
            <TitleMedium color="content.primary">{title}</TitleMedium>
            {required && (
              <LabelLarge color="content.tertiary">{t("required")}</LabelLarge>
            )}
            {badge && (
              <Tag.Root size="sm" colorPalette="blue" ml="auto">
                <Tag.Label>{badge}</Tag.Label>
              </Tag.Root>
            )}
          </HStack>
          {children}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function StrategicPreferencesContent(props: {
  lng: string;
  cityId: string;
  inventoryId: string;
}) {
  const { lng, cityId, inventoryId } = props;
  const { t } = useTranslation(lng, "meed-preferences");
  const router = useRouter();

  // Loaded from localStorage after mount to avoid SSR/client hydration drift.
  const [loaded, setLoaded] = useState(false);
  const [sectors, setSectors] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [timelines, setTimelines] = useState<MeedTimeframePreference[]>([]);
  const [excludedSectors, setExcludedSectors] = useState<string[]>([]);
  const [excludedCoBenefits, setExcludedCoBenefits] = useState<string[]>([]);
  const [excludeText, setExcludeText] = useState("");

  useEffect(() => {
    const saved = getMeedPreferences(inventoryId);
    if (saved) {
      setSectors(saved.sectors ?? []);
      setPriorities(saved.strategicPriorities ?? []);
      setTimelines(saved.timeline ?? []);
      setExcludedSectors(saved.excludedSectors ?? []);
      setExcludedCoBenefits(saved.excludedCoBenefits ?? []);
      setExcludeText(saved.excludeText ?? "");
    }
    setMeedStepState(inventoryId, "preferences", { visited: true });
    setLoaded(true);
  }, [inventoryId]);

  // Persist the form on every change (mirrors the prototype's autosave).
  useEffect(() => {
    if (!loaded) return;
    const existing = getMeedPreferences(inventoryId);
    setMeedPreferences(inventoryId, {
      sectors,
      strategicPriorities: priorities,
      timeline: timelines,
      weights: existing?.weights ?? { ...DEFAULT_MEED_WEIGHTS },
      excludedSectors,
      excludedCoBenefits,
      excludeText,
    });
    setMeedStepState(inventoryId, "preferences", {
      visited: true,
      progress: timelines.length > 0 ? 100 : sectors.length > 0 ? 50 : 10,
    });
  }, [
    loaded,
    inventoryId,
    sectors,
    priorities,
    timelines,
    excludedSectors,
    excludedCoBenefits,
    excludeText,
  ]);

  function toggleTimeline(value: MeedTimeframePreference) {
    setTimelines((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      // "No preference" is mutually exclusive with specific timeframes
      if (value === "no_preference") return ["no_preference"];
      return [...prev.filter((v) => v !== "no_preference"), value];
    });
  }

  const canSave =
    sectors.length > 0 || priorities.length > 0 || timelines.length > 0;
  const hasAnyExclusion =
    excludedSectors.length > 0 ||
    excludedCoBenefits.length > 0 ||
    excludeText.trim().length > 0;

  function saveAndContinue() {
    setMeedStepState(inventoryId, "preferences", {
      visited: true,
      confirmed: true,
    });
    router.push(getMeedPath(lng, cityId, inventoryId, "policy"));
  }

  return (
    <VStack alignItems="stretch" gap="24px">
      <VStack alignItems="stretch" gap="8px">
        <BodyLarge color="content.secondary">{t("description")}</BodyLarge>
        <HStack
          gap="8px"
          px="12px"
          py="6px"
          borderRadius="8px"
          bg="background.neutral"
          alignSelf="flex-start"
        >
          <LabelLarge color="sentiment.positiveDefault">
            {t("alignment-note")}
          </LabelLarge>
        </HStack>
      </VStack>

      {/* Priority sectors */}
      <Section
        title={t("priority-sectors-title")}
        required
        badge={t("badge-alignment-15")}
        t={t}
      >
        <BodyMedium color="content.secondary">
          {t("priority-sectors-description")}
        </BodyMedium>
        <HStack flexWrap="wrap" gap="8px">
          {SECTOR_KEYS.map((key) => (
            <SelectableChip
              key={key}
              label={t(`sector-${kebab(key)}`)}
              selected={sectors.includes(key)}
              onToggle={() => setSectors((prev) => toggleValue(prev, key))}
            />
          ))}
        </HStack>
        {sectors.length > 0 && (
          <BodyMedium color="sentiment.positiveDefault">
            {t("sectors-selected", { count: sectors.length })}
          </BodyMedium>
        )}
      </Section>

      {/* Strategic priorities (co-benefits) */}
      <Section
        title={t("strategic-priorities-title")}
        required
        badge={t("badge-alignment-5")}
        t={t}
      >
        <BodyMedium color="content.secondary">
          {t("strategic-priorities-description")}
        </BodyMedium>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="8px">
          {CO_BENEFIT_KEYS.map((key) => (
            <CheckOption
              key={key}
              label={t(`co-benefit-${kebab(key)}`)}
              selected={priorities.includes(key)}
              onToggle={() => setPriorities((prev) => toggleValue(prev, key))}
            />
          ))}
        </SimpleGrid>
        {priorities.length > 0 && (
          <BodyMedium color="sentiment.positiveDefault">
            {t("co-benefits-selected", { count: priorities.length })}
          </BodyMedium>
        )}
      </Section>

      {/* Implementation timeline */}
      <Section
        title={t("timeline-title")}
        required
        badge={t("badge-alignment-5")}
        t={t}
      >
        <BodyMedium color="content.secondary">
          {t("timeline-description")}
        </BodyMedium>
        <VStack alignItems="stretch" gap="8px">
          {TIMELINE_KEYS.map((key) => (
            <CheckOption
              key={key}
              label={t(`timeline-${kebab(key)}`)}
              sublabel={t(`timeline-${kebab(key)}-sub`)}
              selected={timelines.includes(key)}
              onToggle={() => toggleTimeline(key)}
            />
          ))}
        </VStack>
      </Section>

      {/* Actions to exclude */}
      <Section title={t("exclusions-title")} badge={t("badge-optional")} t={t}>
        <BodyMedium color="content.secondary">
          {t("exclusions-description")}
        </BodyMedium>

        <VStack alignItems="stretch" gap="4px" mt="8px">
          <LabelLarge color="content.secondary">
            {t("exclude-by-sector-title")}
          </LabelLarge>
          <BodyMedium fontSize="xs" color="content.tertiary">
            {t("exclude-by-sector-description")}
          </BodyMedium>
        </VStack>
        <HStack flexWrap="wrap" gap="8px">
          {SECTOR_KEYS.map((key) => (
            <SelectableChip
              key={key}
              label={t(`sector-${kebab(key)}`)}
              selected={excludedSectors.includes(key)}
              onToggle={() =>
                setExcludedSectors((prev) => toggleValue(prev, key))
              }
            />
          ))}
        </HStack>
        {excludedSectors.length > 0 && (
          <BodyMedium color="content.secondary">
            {t("sectors-marked-for-exclusion", {
              count: excludedSectors.length,
            })}
          </BodyMedium>
        )}

        <VStack alignItems="stretch" gap="4px" mt="12px">
          <LabelLarge color="content.secondary">
            {t("exclude-by-co-benefit-title")}
          </LabelLarge>
          <BodyMedium fontSize="xs" color="content.tertiary">
            {t("exclude-by-co-benefit-description")}
          </BodyMedium>
        </VStack>
        <VStack alignItems="stretch" gap="6px">
          {CO_BENEFIT_KEYS.map((key) => (
            <CheckOption
              key={key}
              label={t(`co-benefit-${kebab(key)}`)}
              selected={excludedCoBenefits.includes(key)}
              onToggle={() =>
                setExcludedCoBenefits((prev) => toggleValue(prev, key))
              }
            />
          ))}
        </VStack>
        {excludedCoBenefits.length > 0 && (
          <BodyMedium color="content.secondary">
            {t("co-benefits-marked-for-exclusion", {
              count: excludedCoBenefits.length,
            })}
          </BodyMedium>
        )}

        <VStack alignItems="stretch" gap="4px" mt="12px">
          <LabelLarge color="content.secondary">
            {t("exclude-free-text-title")}
          </LabelLarge>
          <BodyMedium fontSize="xs" color="content.tertiary">
            {t("exclude-free-text-description")}
          </BodyMedium>
        </VStack>
        <Textarea
          value={excludeText}
          onChange={(e) => setExcludeText(e.target.value)}
          placeholder={t("exclude-free-text-placeholder")}
          rows={3}
          bg="base.light"
          borderColor="divider.neutral"
        />
        {excludeText.trim() && (
          <BodyMedium color="content.secondary">
            {t("exclude-free-text-recorded")}
          </BodyMedium>
        )}
        {!hasAnyExclusion && (
          <BodyMedium color="content.tertiary" fontStyle="italic">
            {t("no-exclusions-set")}
          </BodyMedium>
        )}
      </Section>

      <HStack justifyContent="flex-end">
        <CCTerraButton
          variant="filled"
          disabled={!canSave}
          onClick={saveAndContinue}
        >
          {t("save-and-continue")}
        </CCTerraButton>
      </HStack>
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="preferences">
      <StrategicPreferencesContent
        lng={lng}
        cityId={cityId}
        inventoryId={inventoryId}
      />
    </MeedWizardPage>
  );
}
