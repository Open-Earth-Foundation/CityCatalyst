"use client";

/**
 * Review-step cards for the source checks of a PDF extraction
 * (`ExtractionSummary.sourceChecks`): the unit of an ambiguous "MT", the
 * separator of a number such as "6.600", and the document total. Each card
 * shows the imported total under every reading with `optionTotals`, the same
 * function the endpoint uses, so the totals shown are the totals stored.
 * Presentational: the caller sends the answer to the source-checks endpoint,
 * with the readings the totals were computed under (`expected`). One answer is
 * saved at a time: every Confirm is disabled while a save is in flight.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TFunction } from "i18next";
import { Box, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/radio";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { ReportedTotal } from "@/util/GHGI/extraction-summary";
import {
  inPerPersonRange,
  applyReadings,
  optionTotals,
  perPerson,
  PER_PERSON_RANGE,
  totalPlausibility,
  type NumberReading,
  type Readings,
  type SourceChecks,
  type UnitReading,
} from "@/util/GHGI/source-checks";
import { parseNumberString } from "@/util/GHGI/source-text";

/** One card's answer. */
export type CheckAnswer = {
  unit?: UnitReading;
  numberFormat?: NumberReading;
  total?: { candidate: number } | { value: number } | { skip: true };
};

/**
 * Body of one answer to the source-checks endpoint: the answer and the
 * readings the card computed its totals under.
 */
export type SourceCheckAnswer = CheckAnswer & { expected: Readings };

/** Resolves (or returns) false, or throws, when the answer was not saved. */
type OnConfirm = (
  answer: SourceCheckAnswer,
) => void | boolean | Promise<unknown>;
type CardConfirm = (answer: CheckAnswer) => void | boolean | Promise<unknown>;

/** Locale for numbers on the cards; undefined uses the browser default. */
const LocaleContext = createContext<string | undefined>(undefined);

type SaveState = {
  /** True while an answer is being saved. */
  saving: boolean;
  /** Runs one save at a time; resolves true when it succeeded. */
  save: (run: () => unknown) => Promise<boolean>;
};

function useSaveState(): SaveState {
  const [saving, setSaving] = useState(false);
  // A ref, so a second click before the re-render is ignored too.
  const busy = useRef(false);
  const save = useCallback(async (run: () => unknown) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      return (await run()) !== false;
    } catch {
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, []);
  return { saving, save };
}

/** Save state shared by all cards of one review. */
const SaveContext = createContext<SaveState | null>(null);

/** The shared save state, or this component's own outside the cards list. */
function useSave(): SaveState {
  const shared = useContext(SaveContext);
  const own = useSaveState();
  return shared ?? own;
}

/** Tonnes as shown on the cards: "3,250,886 t", "3.25 trillion t". */
export function formatTonnes(
  t: TFunction,
  value: number,
  locale?: string,
): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) {
    return t("import-check-tonnes-trillion", {
      value: (value / 1e12).toLocaleString(locale, {
        maximumFractionDigits: 2,
      }),
    });
  }
  if (abs >= 1e9) {
    return t("import-check-tonnes-billion", {
      value: (value / 1e9).toLocaleString(locale, {
        maximumFractionDigits: 2,
      }),
    });
  }
  return t("import-check-tonnes", {
    value: value.toLocaleString(locale, { maximumFractionDigits: 0 }),
  });
}

/** "p. 7", "pp. 15–19" (consecutive pages), "pp. 3, 8"; empty without pages. */
function formatPages(t: TFunction, pages: number[]): string {
  if (pages.length === 0) return "";
  if (pages.length === 1) return t("import-check-page", { page: pages[0] });
  const consecutive = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  return t("import-check-pages", {
    pages: consecutive
      ? `${pages[0]}–${pages[pages.length - 1]}`
      : pages.join(", "),
  });
}

function AiDraftBadge({ t }: { t: TFunction }) {
  return (
    <Box
      as="span"
      px={2}
      py="2px"
      borderRadius="full"
      bg="sentiment.warningOverlay"
      color="sentiment.warningFg"
      fontSize="body.sm"
      fontWeight="semibold"
      whiteSpace="nowrap"
    >
      {t("import-check-badge")}
    </Box>
  );
}

function NoSourceBadge({ t }: { t: TFunction }) {
  return (
    <Box
      as="span"
      px={2}
      py="2px"
      borderRadius="full"
      bg="background.neutral"
      color="content.secondary"
      fontSize="body.sm"
      whiteSpace="nowrap"
    >
      {t("import-total-no-source")}
    </Box>
  );
}

function EvidenceBox({ children }: { children: ReactNode }) {
  return (
    <Box
      bg="background.neutral"
      borderRadius="md"
      px={3}
      py={2}
      fontSize="body.sm"
      color="content.secondary"
    >
      {children}
    </Box>
  );
}

type CardOption = {
  value: string;
  title: string;
  detail?: string;
  total: string;
};

function OptionList({
  options,
  selected,
  onSelect,
}: {
  options: CardOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <RadioGroup
      value={selected}
      onValueChange={(details) => {
        if (details.value != null) onSelect(details.value);
      }}
    >
      <VStack gap={2} alignItems="stretch">
        {options.map((option) => (
          <Box
            key={option.value}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="md"
            p={3}
            bg={selected === option.value ? "background.neutral" : undefined}
          >
            <Radio
              value={option.value}
              w="full"
              alignItems="flex-start"
              css={{ "& [data-part=item-text]": { flex: 1, minWidth: 0 } }}
            >
              <Flex
                justifyContent="space-between"
                alignItems="flex-start"
                gap={3}
                wrap="wrap"
                w="full"
              >
                <Box minW={0} flex="1 1 180px">
                  <Text fontWeight="bold" fontSize="body.md">
                    {option.title}
                  </Text>
                  {option.detail && (
                    <Text fontSize="body.sm" color="content.secondary">
                      {option.detail}
                    </Text>
                  )}
                </Box>
                <Text fontWeight="semibold" whiteSpace="nowrap">
                  {option.total}
                </Text>
              </Flex>
            </Radio>
          </Box>
        ))}
      </VStack>
    </RadioGroup>
  );
}

/**
 * Blue box with emissions per person for the selected reading, yellow when
 * outside the plausible range, plus the yellow warning above it then.
 */
function PerPersonBoxes({
  t,
  total,
  population,
  highHint,
  implausible,
}: {
  t: TFunction;
  total: number;
  population: number | null;
  /** Hint when far above the range, e.g. "Check the unit." */
  highHint: string;
  /** Yellow warning shown when the reading is out of range. */
  implausible: string;
}) {
  const locale = useContext(LocaleContext);
  const value = perPerson(total, population);
  if (value == null) return null;
  const inRange = inPerPersonRange(value);
  const tone = inRange
    ? { bg: "blue.50", border: "semantic.info" }
    : { bg: "sentiment.warningOverlay", border: "sentiment.warningDefault" };
  return (
    <>
      {!inRange && (
        <Box
          data-testid="check-implausible"
          bg="sentiment.warningOverlay"
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="md"
          px={3}
          py={2}
          fontSize="body.sm"
        >
          {implausible}
        </Box>
      )}
      <Box
        data-testid="check-per-person"
        bg={tone.bg}
        border="1px solid"
        borderColor={tone.border}
        borderRadius="md"
        px={3}
        py={2}
        fontSize="body.sm"
      >
        <Text as="span" fontWeight="bold">
          {t("import-check-per-person", {
            value: value.toLocaleString(locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          })}
        </Text>{" "}
        {inRange
          ? t("import-check-per-person-in-range", {
              min: PER_PERSON_RANGE.min,
              max: PER_PERSON_RANGE.max,
            })
          : value > PER_PERSON_RANGE.max
            ? highHint
            : t("import-check-per-person-low", {
                min: PER_PERSON_RANGE.min,
                max: PER_PERSON_RANGE.max,
              })}
      </Box>
    </>
  );
}

/**
 * Card frame: title, hint and badge; the body and Confirm while open; one
 * "confirmed" line with a Change link once the check is answered.
 */
export function SourceCheckCard({
  t,
  title,
  hint,
  confirmed,
  confirmedLine,
  confirmedBadge,
  confirmDisabled,
  onConfirm,
  footnote,
  children,
}: {
  t: TFunction;
  title: string;
  hint?: string;
  confirmed: boolean;
  confirmedLine: string;
  /** Shown after the confirmed line, e.g. "No source" for a typed total. */
  confirmedBadge?: ReactNode;
  confirmDisabled?: boolean;
  onConfirm: () => void | boolean | Promise<unknown>;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  // This card's save, for its spinner; `saving` is true for any card's save.
  const [mine, setMine] = useState(false);
  const { saving, save } = useSave();

  if (confirmed && !editing) {
    return (
      <HStack
        w="full"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={2}
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="md"
        px={4}
        py={3}
      >
        <HStack gap={2} flexWrap="wrap">
          <Text fontSize="body.md" color="content.secondary">
            {confirmedLine}
          </Text>
          {confirmedBadge}
        </HStack>
        <Button
          variant="ghost"
          size="sm"
          color="content.link"
          onClick={() => setEditing(true)}
        >
          {t("import-check-change")}
        </Button>
      </HStack>
    );
  }

  // The card closes only when the answer was saved.
  const confirm = async () => {
    setMine(true);
    const saved = await save(onConfirm);
    setMine(false);
    if (saved) setEditing(false);
  };

  return (
    <VStack
      w="full"
      alignItems="stretch"
      gap={3}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="md"
      p={4}
    >
      <Flex justifyContent="space-between" gap={2} wrap="wrap">
        <HStack gap={2} flexWrap="wrap" alignItems="baseline">
          <Text fontWeight="bold" fontSize="body.lg">
            {title}
          </Text>
          {hint && (
            <Text fontSize="body.sm" color="content.secondary">
              {hint}
            </Text>
          )}
        </HStack>
        <AiDraftBadge t={t} />
      </Flex>
      {children}
      <Flex
        justifyContent="space-between"
        alignItems="flex-end"
        gap={3}
        wrap="wrap"
      >
        <Box flex="1 1 200px" fontSize="body.sm" color="content.tertiary">
          {footnote}
        </Box>
        <Button
          onClick={confirm}
          loading={mine}
          disabled={confirmDisabled || saving}
          flexShrink={0}
        >
          {t("import-check-confirm")}
        </Button>
      </Flex>
    </VStack>
  );
}

function currentReadings(checks: SourceChecks): Readings {
  return {
    unit: checks.unit?.reading ?? null,
    numberFormat: checks.numberFormat?.reading ?? null,
  };
}

export function UnitCheckCard({
  t,
  check,
  readings,
  rows,
  population,
  onConfirm,
}: {
  t: TFunction;
  check: NonNullable<SourceChecks["unit"]>;
  readings: Readings;
  rows: ExtractedRow[];
  population: number | null;
  onConfirm: CardConfirm;
}) {
  const locale = useContext(LocaleContext);
  const [selected, setSelected] = useState<UnitReading>(check.reading);
  const totals = optionTotals(rows, readings, "unit");
  const totalOf = (reading: UnitReading) =>
    totals.find((o) => o.reading === reading)?.total ?? 0;
  const { evidence } = check;
  const location = [evidence.sources.join(", "), formatPages(t, evidence.pages)]
    .filter(Boolean)
    .join(", ");
  const answerKey = (reading: UnitReading) =>
    reading === "Mt" ? "import-unit-answer-mt" : "import-unit-answer-t";
  const plausibility = (reading: UnitReading) =>
    totalPlausibility(totalOf(reading), population);
  // Each option says what its own total means, never a fixed claim.
  const detail = (reading: UnitReading) => {
    const verdict = plausibility(reading);
    return verdict === "high"
      ? t("import-unit-option-high-detail")
      : verdict === "low"
        ? t("import-unit-option-low-detail")
        : t("import-unit-option-neutral-detail", {
            unit: t(answerKey(reading)),
          });
  };
  // The note that "MT" usually means metric tonnes, only when the totals agree.
  const showFootnote =
    plausibility("t") === "plausible" && plausibility("Mt") === "high";

  return (
    <SourceCheckCard
      t={t}
      title={t("import-unit-check-title")}
      hint={t("import-check-applies-all")}
      confirmed={check.status === "confirmed"}
      confirmedLine={t("import-check-confirmed", {
        check: t("import-unit-check-label"),
        answer: t(answerKey(check.reading)),
      })}
      onConfirm={() => onConfirm({ unit: selected })}
      footnote={showFootnote ? t("import-unit-check-footnote") : undefined}
    >
      <EvidenceBox>
        {location && `${location}: `}
        {t("import-unit-check-evidence", { unitText: evidence.unitText })}
        {evidence.example &&
          ` ${t("import-check-example", {
            label: evidence.example.label,
            text: evidence.example.text,
          })}`}
      </EvidenceBox>
      <OptionList
        selected={selected}
        onSelect={(value) => setSelected(value as UnitReading)}
        options={[
          {
            value: "t",
            title: t("import-unit-option-t"),
            detail: detail("t"),
            total: formatTonnes(t, totalOf("t"), locale),
          },
          {
            value: "Mt",
            title: t("import-unit-option-mt"),
            detail: detail("Mt"),
            total: formatTonnes(t, totalOf("Mt"), locale),
          },
        ]}
      />
      <PerPersonBoxes
        t={t}
        total={totalOf(selected)}
        population={population}
        highHint={t("import-check-per-person-high-unit")}
        implausible={
          selected === "Mt"
            ? t("import-check-implausible")
            : t("import-check-implausible-generic")
        }
      />
    </SourceCheckCard>
  );
}

export function NumberFormatCheckCard({
  t,
  check,
  readings,
  rows,
  population,
  onConfirm,
}: {
  t: TFunction;
  check: NonNullable<SourceChecks["numberFormat"]>;
  readings: Readings;
  rows: ExtractedRow[];
  population: number | null;
  onConfirm: CardConfirm;
}) {
  const locale = useContext(LocaleContext);
  const [selected, setSelected] = useState<NumberReading>(check.reading);
  const totals = optionTotals(rows, readings, "numberFormat");
  const totalOf = (reading: NumberReading) =>
    totals.find((o) => o.reading === reading)?.total ?? 0;
  // Only when the new reading would null gases the rows hold now; going back
  // to the reading they were extracted under restores them.
  const dropsGases = (() => {
    const next = { ...readings, numberFormat: selected };
    return rows.some((row) => {
      if (!row.numberCheck) return false;
      const hasGas = (r: ExtractedRow) =>
        r.co2 != null || r.ch4 != null || r.n2o != null;
      return hasGas(row) && !hasGas(applyReadings([row], readings, next)[0]);
    });
  })();
  const example = check.examples[0] ?? null;
  const readAs = (reading: NumberReading) => {
    const value = example ? parseNumberString(example.text, reading) : null;
    return value == null
      ? t(`import-number-answer-${reading}`)
      : t("import-number-option", {
          // No grouping: "6600" and "6.6" read the same in every locale.
          value: value.toLocaleString(locale, {
            maximumFractionDigits: 6,
            useGrouping: false,
          }),
        });
  };

  return (
    <SourceCheckCard
      t={t}
      title={t("import-number-check-title")}
      hint={t("import-check-applies-all")}
      confirmed={check.status === "confirmed"}
      confirmedLine={t("import-check-confirmed", {
        check: t("import-number-check-label"),
        answer: t(`import-number-answer-${check.reading}`),
      })}
      onConfirm={() => onConfirm({ numberFormat: selected })}
    >
      {check.examples.length > 0 && (
        <EvidenceBox>
          {check.examples
            .map((e) =>
              t("import-number-check-evidence", {
                text: e.text,
                label: e.label,
              }),
            )
            .join(" ")}
        </EvidenceBox>
      )}
      <OptionList
        selected={selected}
        onSelect={(value) => setSelected(value as NumberReading)}
        options={(["english", "european"] as const).map((reading) => ({
          value: reading,
          title: readAs(reading),
          detail: t(`import-number-option-${reading}-detail`),
          total: formatTonnes(t, totalOf(reading), locale),
        }))}
      />
      {dropsGases && (
        <Text fontSize="body.sm" color="content.secondary">
          {t("import-number-check-gases")}
        </Text>
      )}
      <PerPersonBoxes
        t={t}
        total={totalOf(selected)}
        population={population}
        highHint={t("import-check-per-person-high-number")}
        implausible={t("import-check-implausible-generic")}
      />
    </SourceCheckCard>
  );
}

function candidateLocation(t: TFunction, candidate: ReportedTotal): string {
  return [
    candidate.source?.trim(),
    candidate.page != null
      ? t("import-check-page", { page: candidate.page })
      : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function TotalCheckCard({
  t,
  check,
  onConfirm,
}: {
  t: TFunction;
  check: NonNullable<SourceChecks["total"]>;
  onConfirm: CardConfirm;
}) {
  const locale = useContext(LocaleContext);
  // Shared with the card frame, so "Continue without" and Confirm save once.
  const saveState = useSave();
  const { candidates } = check;
  const initial = (() => {
    const fromSelected = check.selected
      ? candidates.findIndex(
          (c) =>
            c.value === check.selected!.value &&
            c.label === check.selected!.label,
        )
      : -1;
    if (fromSelected >= 0) return fromSelected;
    return check.suggested ?? 0;
  })();
  const [selected, setSelected] = useState(initial);
  const [typed, setTyped] = useState("");
  const typedValue = typed.trim() ? parseNumberString(typed, "unknown") : null;
  const typedValid =
    typedValue != null && Number.isFinite(typedValue) && typedValue > 0;

  const confirmedLine = t("import-check-confirmed", {
    check: t("import-total-check-label"),
    answer: check.selected
      ? formatTonnes(t, check.selected.value, locale)
      : t("import-total-none"),
  });

  const single = candidates.length === 1 ? candidates[0] : null;

  return (
    <SaveContext.Provider value={saveState}>
      <SourceCheckCard
        t={t}
        title={t("import-total-check-title")}
        hint={t("import-total-check-hint")}
        confirmed={check.status === "confirmed"}
        confirmedLine={confirmedLine}
        confirmedBadge={
          check.selected?.origin === "user" ? (
            <NoSourceBadge t={t} />
          ) : undefined
        }
        confirmDisabled={candidates.length === 0 && !typedValid}
        onConfirm={() =>
          onConfirm(
            candidates.length === 0
              ? { total: { value: typedValue as number } }
              : { total: { candidate: selected } },
          )
        }
      >
        {single && (
          <EvidenceBox>
            <Flex justifyContent="space-between" gap={3} wrap="wrap">
              <Box minW={0}>
                <Text fontWeight="bold" color="content.primary">
                  {single.label}
                </Text>
                {candidateLocation(t, single) && (
                  <Text>{candidateLocation(t, single)}</Text>
                )}
              </Box>
              <Text
                fontWeight="semibold"
                color="content.primary"
                whiteSpace="nowrap"
              >
                {formatTonnes(t, single.value, locale)}
              </Text>
            </Flex>
          </EvidenceBox>
        )}
        {candidates.length >= 2 && (
          <OptionList
            selected={String(selected)}
            onSelect={(value) => setSelected(Number(value))}
            options={candidates.map((candidate, index) => ({
              value: String(index),
              title: candidate.label,
              detail: candidateLocation(t, candidate) || undefined,
              total: formatTonnes(t, candidate.value, locale),
            }))}
          />
        )}
        {candidates.length === 0 && (
          <VStack alignItems="stretch" gap={2}>
            <Text fontSize="body.sm" color="content.secondary">
              {t("import-total-fallback-hint")}
            </Text>
            <HStack gap={2} flexWrap="wrap">
              <Text asChild fontSize="body.sm">
                <label htmlFor="import-total-input">
                  {t("import-total-input-label")}
                </label>
              </Text>
              <NoSourceBadge t={t} />
            </HStack>
            <Input
              id="import-total-input"
              inputMode="decimal"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              maxW="320px"
            />
            <Box>
              <Button
                variant="ghost"
                size="sm"
                px={0}
                color="content.link"
                textDecoration="underline"
                disabled={saveState.saving}
                onClick={() =>
                  saveState.save(() => onConfirm({ total: { skip: true } }))
                }
              >
                {t("import-total-continue-without")}
              </Button>
            </Box>
          </VStack>
        )}
      </SourceCheckCard>
    </SaveContext.Provider>
  );
}

/**
 * The check cards in order (unit, number format, total). Renders nothing when
 * the summary has no checks (imports stored before them).
 */
export function SourceCheckCards({
  t,
  checks,
  rows,
  population,
  onConfirm,
  locale,
}: {
  t: TFunction;
  checks: SourceChecks | undefined;
  rows: ExtractedRow[];
  population: number | null;
  onConfirm: OnConfirm;
  /** Number locale, e.g. the app language. Defaults to the browser's. */
  locale?: string;
}) {
  const saveState = useSaveState();
  if (!checks || (!checks.unit && !checks.numberFormat && !checks.total)) {
    return null;
  }
  const readings = currentReadings(checks);
  // Every answer names the readings its card computed totals under.
  const confirm: CardConfirm = (answer) =>
    onConfirm({ ...answer, expected: readings });
  return (
    <LocaleContext.Provider value={locale}>
      <SaveContext.Provider value={saveState}>
        <VStack w="full" alignItems="stretch" gap={4} mb={8}>
          {checks.unit && (
            <UnitCheckCard
              key={`unit-${checks.unit.reading}-${checks.unit.status}`}
              t={t}
              check={checks.unit}
              readings={readings}
              rows={rows}
              population={population}
              onConfirm={confirm}
            />
          )}
          {checks.numberFormat && (
            <NumberFormatCheckCard
              key={`number-${checks.numberFormat.reading}-${checks.numberFormat.status}`}
              t={t}
              check={checks.numberFormat}
              readings={readings}
              rows={rows}
              population={population}
              onConfirm={confirm}
            />
          )}
          {checks.total && (
            <TotalCheckCard
              key={`total-${checks.total.status}-${checks.total.selected?.value ?? ""}`}
              t={t}
              check={checks.total}
              onConfirm={confirm}
            />
          )}
        </VStack>
      </SaveContext.Provider>
    </LocaleContext.Provider>
  );
}
