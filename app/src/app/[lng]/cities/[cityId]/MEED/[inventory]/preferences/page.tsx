"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Card,
  Checkbox,
  HStack,
  Icon,
  SimpleGrid,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { LuCheck, LuTarget } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedButton } from "../../components/MeedButton";
import type { MeedTimeframePreference } from "@/util/types/meed";
import { MeedWizardPage } from "../../MeedWizardPage";
import { getMeedPath } from "../../steps";
import { MeedChipGroup } from "../../components/MeedChipGroup";
import { MeedStatusTag, type MeedTone } from "../../components/MeedStatusTag";
import { FOCUS_RING } from "../../focusRing";
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

/** How long the free-text field waits before it writes to storage. */
const TEXT_DEBOUNCE_MS = 500;

/** API option keys use snake_case; locale keys are kebab-case. */
function kebab(key: string): string {
  return key.replace(/_/g, "-");
}

/**
 * A checkbox rendered as a bordered card.
 *
 * Uses Chakra's `Checkbox.Root` parts directly rather than the `ui/checkbox`
 * wrapper, per that component's guidance for checkboxes rendered from a mapped
 * array. The previous version was a `Box as="button"` with a hand-rolled 16px
 * square whose unchecked border used `divider.neutral` — invisible against the
 * card, and invisible to assistive tech too.
 */
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
      onCheckedChange={(details) => onChange(!!details.checked)}
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
      transition="border-color 0.12s, background-color 0.12s"
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
        {sublabel && <Caption color="content.tertiary">{sublabel}</Caption>}
      </VStack>
    </Checkbox.Root>
  );
}

/** Card section with a title, optional required marker and weight badge. */
function Section({
  title,
  required,
  badge,
  badgeTone = "info",
  t,
  children,
}: {
  title: string;
  required?: boolean;
  badge?: string;
  badgeTone?: MeedTone;
  t: TFunction;
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

/** Sub-heading for a block inside a section. */
function FieldLabel({
  title,
  description,
  mt,
}: {
  title: string;
  description: string;
  mt?: string;
}) {
  return (
    <VStack alignItems="stretch" gap="xs" mt={mt}>
      <LabelMedium color="content.secondary">{title}</LabelMedium>
      <Caption color="content.tertiary">{description}</Caption>
    </VStack>
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
  /** Committed value — what gets persisted. */
  const [excludeText, setExcludeText] = useState("");
  /** What the user is currently typing. */
  const [excludeDraft, setExcludeDraft] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    const saved = getMeedPreferences(inventoryId);
    if (saved) {
      setSectors(saved.sectors ?? []);
      setPriorities(saved.strategicPriorities ?? []);
      setTimelines(saved.timeline ?? []);
      setExcludedSectors(saved.excludedSectors ?? []);
      setExcludedCoBenefits(saved.excludedCoBenefits ?? []);
      setExcludeText(saved.excludeText ?? "");
      setExcludeDraft(saved.excludeText ?? "");
    }
    setMeedStepState(inventoryId, "preferences", { visited: true });
    setLoaded(true);
  }, [inventoryId]);

  // The free-text field used to write to storage on every keystroke. Commit it
  // only once the user pauses, then acknowledge the write.
  useEffect(() => {
    if (!loaded || excludeDraft === excludeText) return;
    const timer = window.setTimeout(() => {
      setExcludeText(excludeDraft);
      setShowSaved(true);
    }, TEXT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, excludeDraft, excludeText]);

  useEffect(() => {
    if (!showSaved) return;
    const timer = window.setTimeout(() => setShowSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [showSaved]);

  /** Human sentence shown under this step on the overview and pre-flight. */
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (sectors.length > 0) {
      parts.push(t("sub-sectors", { count: sectors.length }));
    }
    if (priorities.length > 0) {
      parts.push(t("sub-co-benefits", { count: priorities.length }));
    }
    if (timelines.length > 0) {
      parts.push(
        timelines.map((key) => t(`timeline-${kebab(key)}`)).join(", "),
      );
    }
    const exclusions =
      excludedSectors.length +
      excludedCoBenefits.length +
      (excludeText.trim() ? 1 : 0);
    if (exclusions > 0) {
      parts.push(t("sub-exclusions", { count: exclusions }));
    }
    return parts.length > 0 ? parts.join(" · ") : t("sub-none");
  }, [
    t,
    sectors,
    priorities,
    timelines,
    excludedSectors,
    excludedCoBenefits,
    excludeText,
  ]);

  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  // Persist the form whenever a committed value changes.
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
      sub: summaryRef.current,
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

  function toggleTimeline(value: MeedTimeframePreference, checked: boolean) {
    setTimelines((prev) => {
      if (!checked) return prev.filter((v) => v !== value);
      // "No preference" is mutually exclusive with specific timeframes
      if (value === "no_preference") return ["no_preference"];
      return [...prev.filter((v) => v !== "no_preference"), value];
    });
  }

  const sectorOptions = useMemo(
    () =>
      SECTOR_KEYS.map((key) => ({
        value: key,
        label: t(`sector-${kebab(key)}`),
      })),
    [t],
  );

  const hasAnyExclusion =
    excludedSectors.length > 0 ||
    excludedCoBenefits.length > 0 ||
    excludeText.trim().length > 0;

  // No in-page save button: this screen writes every change straight to storage
  // (the effect above), and MeedShell's footer owns forward navigation and the
  // step confirmation. The previous "Save & continue" duplicated that button
  // exactly — same destination, same effect — which is the pattern MeedShell's
  // own docblock rules out ("exactly two actions, never the same one twice").

  return (
    <VStack alignItems="stretch" gap="l">
      <VStack alignItems="stretch" gap="s">
        <BodyLarge color="content.secondary">{t("description")}</BodyLarge>
        {/* What this whole screen is worth, before the user spends time on it. */}
        <HStack
          gap="s"
          px="m"
          py="s"
          borderRadius="rounded"
          bg="background.neutral"
          alignItems="flex-start"
          alignSelf="flex-start"
        >
          <Icon as={LuTarget} boxSize="16px" color="content.link" mt="0" />
          <Caption color="content.secondary">{t("alignment-note")}</Caption>
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
        <MeedChipGroup
          options={sectorOptions}
          selected={sectors}
          onChange={setSectors}
          ariaLabel={t("aria-priority-sectors")}
        />
        {sectors.length > 0 && (
          <BodySmall color="interactive.tertiary" aria-live="polite">
            {t("sectors-selected", { count: sectors.length })}
          </BodySmall>
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
        <SimpleGrid
          columns={{ base: 1, md: 2 }}
          gap="s"
          role="group"
          aria-label={t("aria-strategic-priorities")}
        >
          {CO_BENEFIT_KEYS.map((key) => (
            <CheckCard
              key={key}
              label={t(`co-benefit-${kebab(key)}`)}
              checked={priorities.includes(key)}
              onChange={(next) =>
                setPriorities((prev) =>
                  next ? [...prev, key] : prev.filter((v) => v !== key),
                )
              }
            />
          ))}
        </SimpleGrid>
        {priorities.length > 0 && (
          <BodySmall color="interactive.tertiary" aria-live="polite">
            {t("co-benefits-selected", { count: priorities.length })}
          </BodySmall>
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
        <VStack
          alignItems="stretch"
          gap="s"
          role="group"
          aria-label={t("aria-timeline")}
        >
          {TIMELINE_KEYS.map((key) => (
            <CheckCard
              key={key}
              label={t(`timeline-${kebab(key)}`)}
              sublabel={t(`timeline-${kebab(key)}-sub`)}
              checked={timelines.includes(key)}
              onChange={(next) => toggleTimeline(key, next)}
            />
          ))}
        </VStack>
      </Section>

      {/* Actions to exclude */}
      <Section
        title={t("exclusions-title")}
        badge={t("badge-optional")}
        badgeTone="neutral"
        t={t}
      >
        <BodyMedium color="content.secondary">
          {t("exclusions-description")}
        </BodyMedium>

        <FieldLabel
          title={t("exclude-by-sector-title")}
          description={t("exclude-by-sector-description")}
          mt="s"
        />
        <MeedChipGroup
          options={sectorOptions}
          selected={excludedSectors}
          onChange={setExcludedSectors}
          tone="negative"
          ariaLabel={t("aria-exclude-sectors")}
        />
        {excludedSectors.length > 0 && (
          <BodySmall color="content.secondary" aria-live="polite">
            {t("sectors-marked-for-exclusion", {
              count: excludedSectors.length,
            })}
          </BodySmall>
        )}

        <FieldLabel
          title={t("exclude-by-co-benefit-title")}
          description={t("exclude-by-co-benefit-description")}
          mt="m"
        />
        <VStack
          alignItems="stretch"
          gap="s"
          role="group"
          aria-label={t("aria-exclude-co-benefits")}
        >
          {CO_BENEFIT_KEYS.map((key) => (
            <CheckCard
              key={key}
              label={t(`co-benefit-${kebab(key)}`)}
              checked={excludedCoBenefits.includes(key)}
              onChange={(next) =>
                setExcludedCoBenefits((prev) =>
                  next ? [...prev, key] : prev.filter((v) => v !== key),
                )
              }
            />
          ))}
        </VStack>
        {excludedCoBenefits.length > 0 && (
          <BodySmall color="content.secondary" aria-live="polite">
            {t("co-benefits-marked-for-exclusion", {
              count: excludedCoBenefits.length,
            })}
          </BodySmall>
        )}

        <HStack justifyContent="space-between" alignItems="flex-end" mt="m">
          <FieldLabel
            title={t("exclude-free-text-title")}
            description={t("exclude-free-text-description")}
          />
          <Box aria-live="polite" flexShrink={0} minH="16px">
            {showSaved && (
              <HStack gap="xs" color="interactive.tertiary">
                <Icon as={LuCheck} boxSize="14px" />
                <Caption color="interactive.tertiary">{t("saved")}</Caption>
              </HStack>
            )}
          </Box>
        </HStack>
        <Textarea
          value={excludeDraft}
          onChange={(e) => setExcludeDraft(e.target.value)}
          placeholder={t("exclude-free-text-placeholder")}
          aria-label={t("exclude-free-text-title")}
          rows={3}
          bg="base.light"
          borderWidth="1px"
          borderColor="border.neutral"
          color="content.secondary"
          _hover={{ borderColor: "content.link" }}
          _focusVisible={FOCUS_RING}
        />
        {excludeText.trim() && (
          <BodySmall color="content.secondary">
            {t("exclude-free-text-recorded")}
          </BodySmall>
        )}
        {!hasAnyExclusion && (
          <BodySmall color="content.tertiary" fontStyle="italic">
            {t("no-exclusions-set")}
          </BodySmall>
        )}
      </Section>
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
