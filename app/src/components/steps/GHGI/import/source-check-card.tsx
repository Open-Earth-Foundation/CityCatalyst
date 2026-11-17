"use client";

/**
 * Review-step cards for the source checks of a PDF extraction
 * (`ExtractionSummary.sourceChecks`): the unit of an ambiguous "MT", the unit
 * of each page group of rows printed without one (t, kt or Mt), the separator
 * of a number such as "6.600", and the document total. Each card
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
  compareTableIds,
  optionTotals,
  perPerson,
  PER_PERSON_RANGE,
  readingsOf,
  sumImported,
  totalPlausibility,
  unitGroupOptionTotals,
  DOC_UNIT_GROUP,
  type NumberReading,
  type Readings,
  type SourceChecks,
  type UnitGroup,
  type UnitGroupKey,
  type UnitReading,
} from "@/util/GHGI/source-checks";
import { parseNumberString } from "@/util/GHGI/source-text";

/** One card's answer. */
export type CheckAnswer = {
  /** Unit reading per group key (`doc` for the "MT" card). */
  units?: Record<UnitGroupKey, UnitReading>;
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
  const totals = optionTotals(rows, readings, { unitGroup: DOC_UNIT_GROUP });
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
      onConfirm={() => onConfirm({ units: { [DOC_UNIT_GROUP]: selected } })}
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

const UNIT_OPTION_KEY: Record<UnitReading, string> = {
  t: "import-unit-option-t",
  kt: "import-unit-option-kt",
  Mt: "import-unit-option-mt",
};
const UNIT_ANSWER_KEY: Record<UnitReading, string> = {
  t: "import-unit-answer-t",
  kt: "import-unit-answer-kt",
  Mt: "import-unit-answer-mt",
};

/**
 * "Check units" for rows printed without a unit: one radio group per page
 * group (t, kt or Mt), first selecting the group's answer, else its
 * `preselected` reading. One Confirm answers every group. Each option's total
 * is the import total with that option and the other groups as selected.
 */
export function UnitGroupsCheckCard({
  t,
  groups,
  readings,
  rows,
  population,
  onConfirm,
}: {
  t: TFunction;
  groups: UnitGroup[];
  readings: Readings;
  rows: ExtractedRow[];
  population: number | null;
  onConfirm: CardConfirm;
}) {
  const locale = useContext(LocaleContext);
  const [selected, setSelected] = useState<Record<UnitGroupKey, UnitReading>>(
    () =>
      Object.fromEntries(
        groups.map((group) => [group.key, group.reading ?? group.preselected]),
      ),
  );
  // One conversion from the stored rows, as the endpoint does, so a total is
  // exactly the `importedSum` stored for that answer.
  const selectedTotal = sumImported(
    applyReadings(rows, readings, {
      ...readings,
      units: { ...readings.units, ...selected },
    }),
  );
  const totalsOf = (key: UnitGroupKey) =>
    unitGroupOptionTotals(rows, readings, selected, key);
  const detail = (total: number, reading: UnitReading) => {
    const value = perPerson(total, population);
    if (value != null) {
      return t("import-unit-group-option-per-person", {
        value: value.toLocaleString(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      });
    }
    const verdict = totalPlausibility(total, population);
    return verdict === "high"
      ? t("import-unit-option-high-detail")
      : verdict === "low"
        ? t("import-unit-option-low-detail")
        : t("import-unit-option-neutral-detail", {
            unit: t(UNIT_ANSWER_KEY[reading]),
          });
  };
  // Table groups of one page (structured path) are numbered in table order
  // there, so two groups of one page do not read the same. A page group
  // without a table keeps the page heading.
  const tableNumber = new Map<UnitGroupKey, number>();
  for (const group of groups) {
    if (group.page == null || group.tableId == null) continue;
    const tables = groups
      .filter((g) => g.page === group.page && g.tableId != null)
      .map((g) => g.tableId!)
      .sort(compareTableIds);
    if (tables.length > 1) {
      tableNumber.set(group.key, tables.indexOf(group.tableId) + 1);
    }
  }
  const answerOf = (group: UnitGroup) => {
    const unit = t(UNIT_ANSWER_KEY[group.reading ?? group.preselected]);
    const table = tableNumber.get(group.key);
    if (table != null) {
      return t("import-unit-group-answer-table", {
        page: group.page,
        table,
        unit,
      });
    }
    return t(
      group.page != null
        ? "import-unit-group-answer"
        : "import-unit-group-answer-no-page",
      { page: group.page, unit },
    );
  };

  return (
    <SourceCheckCard
      t={t}
      title={t("import-unit-check-title")}
      hint={t("import-unit-group-hint")}
      confirmed={groups.every((group) => group.status === "confirmed")}
      confirmedLine={t("import-check-confirmed", {
        check: t("import-unit-check-label"),
        answer: groups.map(answerOf).join(", "),
      })}
      onConfirm={() => onConfirm({ units: { ...selected } })}
    >
      {groups.map((group) => {
        const totals = totalsOf(group.key);
        const totalOf = (reading: UnitReading) =>
          totals.find((o) => o.reading === reading)?.total ?? 0;
        return (
          <VStack
            key={group.key}
            data-testid={`unit-group-${group.key}`}
            alignItems="stretch"
            gap={2}
          >
            <Text fontWeight="semibold" fontSize="body.md">
              {tableNumber.has(group.key)
                ? t("import-unit-group-heading-table", {
                    page: group.page,
                    table: tableNumber.get(group.key),
                    count: group.rowCount,
                  })
                : group.page != null
                  ? t("import-unit-group-heading", {
                      page: group.page,
                      count: group.rowCount,
                    })
                  : t("import-unit-group-heading-no-page", {
                      count: group.rowCount,
                    })}
            </Text>
            {group.kgOnly && (
              <Text fontSize="body.sm" color="content.secondary">
                {t("import-unit-group-kg-only")}
              </Text>
            )}
            <OptionList
              selected={selected[group.key]}
              onSelect={(value) =>
                setSelected((current) => ({
                  ...current,
                  [group.key]: value as UnitReading,
                }))
              }
              options={group.options.map((reading) => ({
                value: reading,
                title: t(UNIT_OPTION_KEY[reading]),
                detail: detail(totalOf(reading), reading),
                total: formatTonnes(t, totalOf(reading), locale),
              }))}
            />
          </VStack>
        );
      })}
      <PerPersonBoxes
        t={t}
        total={selectedTotal}
        population={population}
        highHint={t("import-check-per-person-high-unit")}
        implausible={t("import-check-implausible-generic")}
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

/**
 * Number reading of a locale: european when it writes a decimal comma
 * (de, es, fr, pt), else english. Undefined: the browser's locale.
 */
export function localeNumberReading(locale?: string): NumberReading {
  const decimal = new Intl.NumberFormat(locale)
    .formatToParts(1.5)
    .find((part) => part.type === "decimal")?.value;
  return decimal === "," ? "european" : "english";
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
    // No qualifying total (e.g. only net totals for BASIC): the user picks.
    return check.suggested ?? null;
  })();
  const [selected, setSelected] = useState<number | null>(initial);
  const [typed, setTyped] = useState("");
  const typedValue = typed.trim()
    ? parseNumberString(typed, localeNumberReading(locale))
    : null;
  const typedValid =
    typedValue != null && Number.isFinite(typedValue) && typedValue > 0;

  const confirmedLine = t("import-check-confirmed", {
    check: t("import-total-check-label"),
    answer: check.selected
      ? formatTonnes(t, check.selected.value, locale)
      : t("import-total-none"),
  });

  // A single total is shown as evidence only when it is the suggestion;
  // otherwise it is an option the user has to pick.
  const single =
    candidates.length === 1 && selected === 0 ? candidates[0] : null;
  const listed = candidates.length >= 2 || (candidates.length === 1 && !single);

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
        confirmDisabled={
          candidates.length === 0 ? !typedValid : selected == null
        }
        onConfirm={() =>
          onConfirm(
            candidates.length === 0
              ? { total: { value: typedValue as number } }
              : { total: { candidate: selected as number } },
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
        {listed && (
          <OptionList
            selected={selected == null ? "" : String(selected)}
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
            {typedValid && (
              <Text
                data-testid="import-total-parsed"
                fontSize="body.sm"
                color="content.secondary"
              >
                = {formatTonnes(t, typedValue as number, locale)}
              </Text>
            )}
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
 * The check cards in order ("MT" unit, unit groups, number format, total).
 * Renders nothing when the summary has no checks (imports stored before them).
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
  const unitGroups = checks?.unitGroups ?? [];
  if (
    !checks ||
    (!checks.unit &&
      unitGroups.length === 0 &&
      !checks.numberFormat &&
      !checks.total)
  ) {
    return null;
  }
  const readings = readingsOf(checks);
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
          {unitGroups.length > 0 && (
            <UnitGroupsCheckCard
              key={`unit-groups-${unitGroups
                .map((g) => `${g.key}:${g.status}:${g.reading ?? ""}`)
                .join(",")}`}
              t={t}
              groups={unitGroups}
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
