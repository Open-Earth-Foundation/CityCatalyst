"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useId, useState } from "react";

import {
  Box,
  Grid,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2, LuX } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteFieldEvidence,
  ConceptNoteFunderImportDraft,
} from "@/util/types";

import {
  emptyChapter,
  emptyFact,
  evidenceFor,
  fieldProvenance,
  groupProvenance,
  originalDisplay,
  type ChapterRow,
  type FactGroup,
  type FunderForm,
  type FunderFormErrors,
  type FunderTextField,
  type ProgrammeListField,
  type ProgrammeTextField,
  type Provenance,
} from "./funder-import-form";

type FormUpdate = (update: (form: FunderForm) => FunderForm) => void;

const provenanceColor: Record<Provenance, string> = {
  document: "content.link",
  edited: "sentiment.warningDefault",
  entered: "sentiment.positiveDefault",
  missing: "content.tertiary",
};

function ProvenancePill({
  provenance,
  lng,
}: {
  provenance: Provenance;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const color = provenanceColor[provenance];
  return (
    <HStack
      as="span"
      gap={1.5}
      border="1px solid"
      borderColor={color}
      borderRadius="pill"
      bg={provenance === "missing" ? "background.neutral" : "base.light"}
      px={2}
      py={0.5}
      data-provenance={provenance}
    >
      <Box boxSize="6px" borderRadius="full" bg={color} />
      <Text
        as="span"
        fontSize="10px"
        lineHeight="16px"
        color="content.secondary"
      >
        {t(`funder-provenance-${provenance}`)}
      </Text>
    </HStack>
  );
}

function EvidenceQuotes({
  evidence,
  lng,
}: {
  evidence: ConceptNoteFieldEvidence[];
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!evidence.length) return null;
  return (
    <VStack align="stretch" gap={1} mt={1.5}>
      {evidence.slice(0, 2).map((item) => (
        <Text
          key={item.quote}
          ps={2}
          borderInlineStart="2px solid"
          borderColor="border.neutral"
          fontSize="label.sm"
          color="content.tertiary"
          overflowWrap="anywhere"
        >
          <Text as="q" fontStyle="italic">
            {item.quote}
          </Text>
          {item.page !== null &&
            ` · ${t("funder-evidence-page", { page: item.page })}`}
        </Text>
      ))}
    </VStack>
  );
}

interface ReviewFieldProps {
  id: string;
  label: string;
  required?: boolean;
  provenance: Provenance | null;
  evidence?: ConceptNoteFieldEvidence[];
  original?: string;
  error?: string | null;
  full?: boolean;
  lng: string;
  children: ReactNode;
}

/** A labelled input with its source pill, quotes and original value. */
function ReviewField({
  id,
  label,
  required,
  provenance,
  evidence = [],
  original,
  error,
  full,
  lng,
  children,
}: ReviewFieldProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <Box gridColumn={full ? "1 / -1" : undefined} minW={0}>
      <HStack gap={2} mb={1} flexWrap="wrap">
        <Text
          asChild
          fontSize="label.sm"
          fontWeight="semibold"
          color="content.secondary"
        >
          <label htmlFor={id}>{required ? `${label} *` : label}</label>
        </Text>
        {provenance && <ProvenancePill provenance={provenance} lng={lng} />}
      </HStack>
      {children}
      {error && (
        <Text
          id={`${id}-error`}
          mt={1}
          fontSize="label.sm"
          color="sentiment.negativeDefault"
        >
          {error}
        </Text>
      )}
      <EvidenceQuotes evidence={evidence} lng={lng} />
      {provenance === "edited" && original !== undefined && (
        <Box mt={1}>
          <Button
            size="xs"
            variant="ghost"
            px={1}
            color="content.link"
            textDecoration="underline"
            onClick={() => setShowOriginal((value) => !value)}
            aria-expanded={showOriginal}
          >
            {t(showOriginal ? "funder-hide-original" : "funder-show-original")}
          </Button>
          {showOriginal && (
            <Text
              ps={2}
              borderInlineStart="2px solid"
              borderColor="border.neutral"
              fontSize="label.sm"
              color="content.tertiary"
            >
              {original
                ? t("funder-original-value", { value: original })
                : t("funder-original-empty")}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Free-text tags; Enter or comma adds, the tag button removes. */
function TagInput({
  id,
  values,
  onChange,
  placeholder,
  disabled,
  lng,
  invalid,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  lng: string;
  invalid?: boolean;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [text, setText] = useState("");
  function commit(): void {
    const value = text.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setText("");
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  }
  return (
    <Box>
      {values.length > 0 && (
        <HStack gap={1.5} flexWrap="wrap" mb={1.5}>
          {values.map((value) => (
            <HStack
              key={value}
              gap={0.5}
              ps={2}
              borderRadius="pill"
              border="1px solid"
              borderColor="border.neutral"
              bg="background.alternativeLight"
            >
              <Text fontSize="label.sm" color="content.secondary">
                {value}
              </Text>
              <IconButton
                size="2xs"
                variant="ghost"
                borderRadius="pill"
                aria-label={t("funder-remove-item", { value })}
                disabled={disabled}
                onClick={() =>
                  onChange(values.filter((item) => item !== value))
                }
              >
                <LuX />
              </IconButton>
            </HStack>
          ))}
        </HStack>
      )}
      <Input
        id={id}
        size="sm"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </Box>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h4" fontSize="body.md" color="content.primary">
      {children}
    </Heading>
  );
}

const sectionProps = {
  align: "stretch",
  gap: 4,
  borderTop: "1px solid",
  borderColor: "border.neutral",
  pt: 5,
} as const;

interface FunderReviewFormProps {
  form: FunderForm;
  onChange: FormUpdate;
  draft: ConceptNoteFunderImportDraft | null;
  filename: string | null;
  errors: FunderFormErrors;
  disabled?: boolean;
  lng: string;
}

/**
 * Editable funder profile, programme and application template (the fields of
 * `funding-details.tsx`), with where each value came from.
 */
export function FunderReviewForm({
  form,
  onChange,
  draft,
  filename,
  errors,
  disabled,
  lng,
}: FunderReviewFormProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const idPrefix = useId();
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const touch = (path: string) =>
    setTouched((current) =>
      current.has(path) ? current : new Set(current).add(path),
    );
  const fieldId = (path: string) => `${idPrefix}-${path.replace(/\W/g, "-")}`;
  const errorFor = (path: string) =>
    touched.has(path) && errors[path] ? t(errors[path]) : null;
  const inputA11y = (path: string) => {
    const error = errorFor(path);
    return {
      id: fieldId(path),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${fieldId(path)}-error` : undefined,
      onBlur: () => touch(path),
      disabled,
    };
  };

  function setFunderText(field: FunderTextField, value: string): void {
    onChange((current) => ({
      ...current,
      funder: { ...current.funder, [field]: value },
    }));
  }
  function setProgrammeText(field: ProgrammeTextField, value: string): void {
    onChange((current) => ({
      ...current,
      opportunity: { ...current.opportunity, [field]: value },
    }));
  }
  function setProgrammeList(field: ProgrammeListField, value: string[]): void {
    onChange((current) => ({
      ...current,
      opportunity: { ...current.opportunity, [field]: value },
    }));
  }
  function updateFacts(
    group: FactGroup,
    update: (
      rows: FunderForm["funder"]["stated"],
    ) => FunderForm["funder"]["stated"],
  ): void {
    onChange((current) => ({
      ...current,
      funder: { ...current.funder, [group]: update(current.funder[group]) },
    }));
  }
  function updateChapters(update: (rows: ChapterRow[]) => ChapterRow[]): void {
    onChange((current) => ({
      ...current,
      template: {
        ...current.template,
        chapters: update(current.template.chapters),
      },
    }));
  }
  function updateChapter(id: string, patch: Partial<ChapterRow>): void {
    updateChapters((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  function moveChapter(index: number, offset: -1 | 1): void {
    updateChapters((rows) => {
      const next = [...rows];
      const [row] = next.splice(index, 1);
      next.splice(index + offset, 0, row!);
      return next;
    });
  }

  const textField = (
    entity: "funder" | "opportunity",
    field: FunderTextField | ProgrammeTextField,
    labelKey: string,
    options: { required?: boolean; full?: boolean; multiline?: boolean } = {},
  ) => {
    const path = `${entity}.${field}`;
    const value =
      entity === "funder"
        ? form.funder[field as FunderTextField]
        : form.opportunity[field as ProgrammeTextField];
    const set = (next: string) =>
      entity === "funder"
        ? setFunderText(field as FunderTextField, next)
        : setProgrammeText(field as ProgrammeTextField, next);
    const provenance = fieldProvenance(draft, path, value);
    return (
      <ReviewField
        id={fieldId(path)}
        label={t(labelKey)}
        required={options.required}
        full={options.full}
        provenance={provenance}
        evidence={evidenceFor(draft, [path])}
        original={originalDisplay(draft, path)}
        error={errorFor(path)}
        lng={lng}
      >
        {options.multiline ? (
          <Textarea
            {...inputA11y(path)}
            size="sm"
            rows={3}
            value={value}
            placeholder={
              provenance === "missing" ? t("funder-not-stated") : undefined
            }
            onChange={(event) => set(event.target.value)}
          />
        ) : (
          <Input
            {...inputA11y(path)}
            size="sm"
            value={value}
            placeholder={
              provenance === "missing" ? t("funder-not-stated") : undefined
            }
            onChange={(event) => set(event.target.value)}
          />
        )}
      </ReviewField>
    );
  };

  const listField = (field: "hazards" | "interventions", labelKey: string) => {
    const path = `opportunity.${field}`;
    return (
      <ReviewField
        id={fieldId(path)}
        label={t(labelKey)}
        provenance={fieldProvenance(draft, path, form.opportunity[field])}
        evidence={evidenceFor(draft, [path])}
        original={originalDisplay(draft, path)}
        lng={lng}
      >
        <TagInput
          id={fieldId(path)}
          values={form.opportunity[field]}
          onChange={(values) => setProgrammeList(field, values)}
          placeholder={t("funder-tags-placeholder")}
          disabled={disabled}
          lng={lng}
        />
      </ReviewField>
    );
  };

  const factGroup = (group: FactGroup) => (
    <VStack align="stretch" gap={2}>
      <Text fontSize="label.sm" fontWeight="semibold" color="content.secondary">
        {t(`funding-field-${group}`)}
      </Text>
      {form.funder[group].map((row) => {
        const path = `funder.profile.${group}.${row.key.trim()}`;
        const provenance = fieldProvenance(draft, path, row.value);
        return (
          <Box
            key={row.id}
            ps={2}
            borderInlineStart="2px solid"
            borderColor="border.neutral"
          >
            <HStack align="start" gap={2}>
              <Input
                size="sm"
                maxW="180px"
                value={row.key}
                aria-label={t("funder-fact-key")}
                placeholder={t("funder-fact-key")}
                disabled={disabled}
                onChange={(event) =>
                  updateFacts(group, (rows) =>
                    rows.map((item) =>
                      item.id === row.id
                        ? { ...item, key: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Textarea
                size="sm"
                rows={1}
                autoresize
                flex={1}
                value={row.value}
                aria-label={t("funder-fact-value")}
                placeholder={t("funder-fact-value")}
                disabled={disabled}
                onChange={(event) =>
                  updateFacts(group, (rows) =>
                    rows.map((item) =>
                      item.id === row.id
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={t("funder-remove-fact")}
                disabled={disabled}
                onClick={() =>
                  updateFacts(group, (rows) =>
                    rows.filter((item) => item.id !== row.id),
                  )
                }
              >
                <LuTrash2 />
              </IconButton>
            </HStack>
            <HStack mt={1} gap={2}>
              {provenance && (
                <ProvenancePill provenance={provenance} lng={lng} />
              )}
            </HStack>
            <EvidenceQuotes evidence={evidenceFor(draft, [path])} lng={lng} />
          </Box>
        );
      })}
      <Box>
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => updateFacts(group, (rows) => [...rows, emptyFact()])}
        >
          <Icon as={LuPlus} />
          {t("funder-add-fact")}
        </Button>
      </Box>
    </VStack>
  );

  const awardPaths = [
    "opportunity.min_award",
    "opportunity.max_award",
    "opportunity.currency",
  ];
  const awardError =
    errorFor("opportunity.min_award") ?? errorFor("opportunity.max_award");
  const chaptersMissing =
    Boolean(draft?.missing.includes("template.chapter_schema")) &&
    form.template.chapters.every((chapter) => !chapter.title.trim());

  return (
    <VStack align="stretch" gap={6} data-testid="funder-review-form">
      <Box>
        <Heading as="h3" fontSize="title.md">
          {t(draft ? "funder-review-title" : "funder-manual-title")}
        </Heading>
        <Text mt={1} fontSize="body.sm" color="content.secondary">
          {draft && filename
            ? t("funder-review-from-document", { filename })
            : t("funder-manual-description")}
        </Text>
        {draft && (
          <HStack mt={3} gap={2} flexWrap="wrap" aria-hidden>
            {(["document", "edited", "entered", "missing"] as const).map(
              (provenance) => (
                <ProvenancePill
                  key={provenance}
                  provenance={provenance}
                  lng={lng}
                />
              ),
            )}
          </HStack>
        )}
      </Box>

      <VStack align="stretch" gap={4}>
        <SectionHeading>{t("funder-section-funder")}</SectionHeading>
        <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
          {textField("funder", "name", "funder-field-name", {
            required: true,
            full: true,
          })}
          {textField("funder", "funder_type", "funder-field-type")}
          {textField("funder", "country", "funder-field-country")}
          {textField("funder", "region", "funder-field-region", { full: true })}
        </Grid>
        <Text fontSize="label.sm" color="content.tertiary">
          {t("funder-profile-facts-help")}
        </Text>
        {factGroup("stated")}
        {factGroup("derived")}
      </VStack>

      <VStack {...sectionProps}>
        <SectionHeading>{t("funder-section-programme")}</SectionHeading>
        <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
          {textField("opportunity", "name", "funder-field-programme-name", {
            required: true,
            full: true,
          })}
          {textField("opportunity", "summary", "funder-field-summary", {
            full: true,
            multiline: true,
          })}
          {textField("opportunity", "applicant_type", "funding-applicants")}
          {textField(
            "opportunity",
            "region_scope",
            "funder-field-region-scope",
          )}
          {textField("opportunity", "sector", "funding-sector")}
          {textField("opportunity", "category", "funding-category")}
          {textField(
            "opportunity",
            "instrument_type",
            "funder-field-instrument",
          )}
          {textField("opportunity", "finance_route", "funding-finance-route")}
          {textField("opportunity", "status", "funding-status")}
          <ReviewField
            id={fieldId("opportunity.min_award")}
            label={t("funding-award")}
            provenance={groupProvenance(draft, [
              ["opportunity.min_award", form.opportunity.min_award],
              ["opportunity.max_award", form.opportunity.max_award],
              ["opportunity.currency", form.opportunity.currency],
            ])}
            evidence={evidenceFor(draft, awardPaths)}
            original={[
              originalDisplay(draft, "opportunity.min_award"),
              originalDisplay(draft, "opportunity.max_award"),
              originalDisplay(draft, "opportunity.currency"),
            ]
              .filter(Boolean)
              .join(" · ")}
            error={awardError}
            lng={lng}
          >
            <Grid templateColumns="1fr 1fr 80px" gap={1.5}>
              <Input
                {...inputA11y("opportunity.min_award")}
                size="sm"
                inputMode="decimal"
                aria-label={t("funder-field-min-award")}
                placeholder={t("funder-field-min-award")}
                value={form.opportunity.min_award}
                onChange={(event) =>
                  setProgrammeText("min_award", event.target.value)
                }
              />
              <Input
                {...inputA11y("opportunity.max_award")}
                size="sm"
                inputMode="decimal"
                aria-label={t("funder-field-max-award")}
                placeholder={t("funder-field-max-award")}
                value={form.opportunity.max_award}
                onChange={(event) =>
                  setProgrammeText("max_award", event.target.value)
                }
              />
              <Input
                {...inputA11y("opportunity.currency")}
                size="sm"
                aria-label={t("funder-field-currency")}
                placeholder={t("funder-field-currency")}
                value={form.opportunity.currency}
                onChange={(event) =>
                  setProgrammeText("currency", event.target.value)
                }
              />
            </Grid>
          </ReviewField>
          {listField("hazards", "funding-hazards")}
          {listField("interventions", "funding-interventions")}
        </Grid>
        <Box bg="sentiment.warningOverlay" p={3} borderRadius="rounded">
          <HStack gap={2} flexWrap="wrap">
            <Text fontWeight="semibold" fontSize="body.sm">
              {t("funding-known-gaps")}
            </Text>
            {(() => {
              const provenance = fieldProvenance(
                draft,
                "opportunity.known_gaps",
                form.opportunity.known_gaps,
              );
              return provenance ? (
                <ProvenancePill provenance={provenance} lng={lng} />
              ) : null;
            })()}
          </HStack>
          <VStack align="stretch" gap={1.5} mt={2}>
            {form.opportunity.known_gaps.map((gap, index) => (
              <HStack key={index} gap={2}>
                <Input
                  size="sm"
                  bg="base.light"
                  value={gap}
                  aria-label={t("funder-known-gap-item", { index: index + 1 })}
                  disabled={disabled}
                  onChange={(event) =>
                    setProgrammeList(
                      "known_gaps",
                      form.opportunity.known_gaps.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("funder-remove-known-gap")}
                  disabled={disabled}
                  onClick={() =>
                    setProgrammeList(
                      "known_gaps",
                      form.opportunity.known_gaps.filter(
                        (_item, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  <LuTrash2 />
                </IconButton>
              </HStack>
            ))}
            {!form.opportunity.known_gaps.length && (
              <Text fontSize="label.sm" color="content.secondary">
                {t("funder-known-gaps-empty")}
              </Text>
            )}
            <Box>
              <Button
                size="xs"
                variant="outline"
                bg="base.light"
                disabled={disabled}
                onClick={() =>
                  setProgrammeList("known_gaps", [
                    ...form.opportunity.known_gaps,
                    "",
                  ])
                }
              >
                <Icon as={LuPlus} />
                {t("funder-add-known-gap")}
              </Button>
            </Box>
          </VStack>
        </Box>
      </VStack>

      <VStack {...sectionProps}>
        <SectionHeading>{t("funding-template-preview")}</SectionHeading>
        <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
          <ReviewField
            id={fieldId("template.template_name")}
            label={t("funder-field-template-name")}
            required
            provenance={fieldProvenance(
              draft,
              "template.template_name",
              form.template.template_name,
            )}
            evidence={evidenceFor(draft, ["template.template_name"])}
            original={originalDisplay(draft, "template.template_name")}
            error={errorFor("template.template_name")}
            lng={lng}
          >
            <Input
              {...inputA11y("template.template_name")}
              size="sm"
              value={form.template.template_name}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  template: {
                    ...current.template,
                    template_name: event.target.value,
                  },
                }))
              }
            />
          </ReviewField>
          <ReviewField
            id={fieldId("template.output_format")}
            label={t("funder-field-output-format")}
            provenance={fieldProvenance(
              draft,
              "template.output_format",
              form.template.output_format,
            )}
            evidence={evidenceFor(draft, ["template.output_format"])}
            original={originalDisplay(draft, "template.output_format")}
            lng={lng}
          >
            <Input
              {...inputA11y("template.output_format")}
              size="sm"
              value={form.template.output_format}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  template: {
                    ...current.template,
                    output_format: event.target.value,
                  },
                }))
              }
            />
          </ReviewField>
        </Grid>
        <HStack gap={2} flexWrap="wrap">
          <Text fontSize="label.sm" color="content.tertiary">
            {t("funding-template-chapters", {
              count: form.template.chapters.length,
            })}
          </Text>
          {chaptersMissing && <ProvenancePill provenance="missing" lng={lng} />}
        </HStack>
        {errors["template.chapter_schema"] && (
          <Text
            role="alert"
            fontSize="label.sm"
            color="sentiment.negativeDefault"
          >
            {t(errors["template.chapter_schema"])}
          </Text>
        )}
        <Box as="ol" listStyleType="none" m={0} p={0}>
          {form.template.chapters.map((chapter, index) => {
            const path = `template.chapter_schema.${chapter.chapter_ref}`;
            const titlePath = `chapter.${chapter.id}.title`;
            const provenance = fieldProvenance(
              draft,
              chapter.chapter_ref ? path : "template.chapter_schema.",
              chapter,
            );
            return (
              <Box
                as="li"
                key={chapter.id}
                display="flex"
                gap={3}
                py={3}
                borderTop="1px solid"
                borderColor="border.neutral"
                data-testid="funder-chapter"
              >
                <Text
                  color="content.link"
                  fontSize="body.sm"
                  fontWeight="semibold"
                  minW="24px"
                  pt={1}
                >
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <VStack align="stretch" flex={1} minW={0} gap={2}>
                  <ReviewField
                    id={fieldId(titlePath)}
                    label={t("funder-field-chapter-title")}
                    required
                    provenance={provenance}
                    evidence={evidenceFor(draft, [path])}
                    original={originalDisplay(draft, path)}
                    error={errorFor(titlePath)}
                    lng={lng}
                  >
                    <Input
                      {...inputA11y(titlePath)}
                      size="sm"
                      value={chapter.title}
                      onChange={(event) =>
                        updateChapter(chapter.id, { title: event.target.value })
                      }
                    />
                  </ReviewField>
                  <Textarea
                    size="sm"
                    rows={2}
                    value={chapter.description}
                    aria-label={t("funder-field-chapter-description")}
                    placeholder={t("funder-field-chapter-description")}
                    disabled={disabled}
                    onChange={(event) =>
                      updateChapter(chapter.id, {
                        description: event.target.value,
                      })
                    }
                  />
                  <Box>
                    <Text asChild fontSize="label.sm" color="content.tertiary">
                      <label htmlFor={fieldId(`chapter.${chapter.id}.fields`)}>
                        {t("funding-required-fields")}
                      </label>
                    </Text>
                    <TagInput
                      id={fieldId(`chapter.${chapter.id}.fields`)}
                      values={chapter.required_fields}
                      onChange={(values) =>
                        updateChapter(chapter.id, { required_fields: values })
                      }
                      placeholder={t("funder-required-fields-placeholder")}
                      disabled={disabled}
                      lng={lng}
                    />
                  </Box>
                  <HStack justify="space-between" flexWrap="wrap" gap={2}>
                    <Checkbox
                      size="sm"
                      checked={chapter.required}
                      disabled={disabled}
                      onCheckedChange={({ checked }) =>
                        updateChapter(chapter.id, {
                          required: checked === true,
                        })
                      }
                    >
                      {t("funding-required")}
                    </Checkbox>
                    <HStack gap={1}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label={t("funder-move-chapter-up")}
                        disabled={disabled || index === 0}
                        onClick={() => moveChapter(index, -1)}
                      >
                        <LuArrowUp />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label={t("funder-move-chapter-down")}
                        disabled={
                          disabled ||
                          index === form.template.chapters.length - 1
                        }
                        onClick={() => moveChapter(index, 1)}
                      >
                        <LuArrowDown />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label={t("funder-remove-chapter")}
                        disabled={disabled}
                        onClick={() =>
                          updateChapters((rows) =>
                            rows.filter((row) => row.id !== chapter.id),
                          )
                        }
                      >
                        <LuTrash2 />
                      </IconButton>
                    </HStack>
                  </HStack>
                </VStack>
              </Box>
            );
          })}
        </Box>
        <Box>
          <Button
            size="xs"
            variant="outline"
            disabled={disabled}
            onClick={() => updateChapters((rows) => [...rows, emptyChapter()])}
          >
            <Icon as={LuPlus} />
            {t("funder-add-chapter")}
          </Button>
        </Box>
      </VStack>
    </VStack>
  );
}
