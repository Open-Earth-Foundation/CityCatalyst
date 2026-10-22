"use client";

import type { ReactNode } from "react";
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
import { LuPlus, LuTrash2 } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteFunderImport } from "@/util/types";

import {
  emptyChapter,
  type ChapterRow,
  type FunderForm,
  type FunderFormErrors,
  type FunderTextSection,
  type TemplateForm,
} from "./funder-form";

const sectionProps = {
  align: "stretch",
  gap: 4,
  borderTop: "1px solid",
  borderColor: "border.neutral",
  pt: 5,
} as const;
const fieldGrid = { templateColumns: { base: "1fr", sm: "1fr 1fr" }, gap: 4 };

interface TextFieldOptions {
  required?: boolean;
  full?: boolean;
  multiline?: boolean;
  rows?: number;
  help?: string;
}

interface FormProps<F> {
  form: F;
  onChange: (update: (form: F) => F) => void;
  /** Errors to show; empty until the user first tries to submit. */
  errors: FunderFormErrors;
  disabled?: boolean;
  lng: string;
}

interface SourcedFormProps<F> extends FormProps<F> {
  /** The document import the values were filled from, if any. */
  source: ConceptNoteFunderImport | null;
}

/** One labelled text input; `path` keys its error. */
function TextField({
  path,
  label,
  value,
  onChange,
  errors,
  disabled,
  lng,
  options: { required, full, multiline, rows, help } = {},
}: {
  path: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: FunderFormErrors;
  disabled?: boolean;
  lng: string;
  options?: TextFieldOptions;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const Control = multiline ? Textarea : Input;
  return (
    <Field
      label={t(label)}
      required={required}
      invalid={Boolean(errors[path])}
      errorText={errors[path] ? t(errors[path]) : null}
      helperText={help ? t(help) : undefined}
      gridColumn={full ? "1 / -1" : undefined}
    >
      <Control
        size="sm"
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** Form heading, the document it was filled from and how much was missing. */
function FormIntro({
  title,
  description,
  source,
  lng,
}: {
  title: string;
  description: string;
  source: ConceptNoteFunderImport | null;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const missingCount = source?.draft?.missing.length ?? 0;
  return (
    <Box>
      <Heading as="h3" fontSize="title.md">
        {title}
      </Heading>
      <Text mt={1} fontSize="body.sm" color="content.secondary">
        {description}
      </Text>
      {missingCount > 0 && (
        <Text
          mt={3}
          p={3}
          fontSize="body.sm"
          bg="sentiment.warningOverlay"
          borderRadius="rounded"
        >
          {t("funder-import-missing", { count: missingCount })}
        </Text>
      )}
    </Box>
  );
}

/** Editable funder, programme and application template (`funding-details.tsx` fields). */
export function AddFunderForm(props: SourcedFormProps<FunderForm>) {
  const { form, onChange, source, lng } = props;
  const { t } = useTranslation(lng, "concept-notes");

  function textField<S extends FunderTextSection>(
    section: S,
    field: keyof FunderForm[S] & string,
    label: string,
    options?: TextFieldOptions,
  ): ReactNode {
    const values: Record<string, string> = form[section];
    return (
      <TextField
        key={`${section}.${field}`}
        {...props}
        path={`${section}.${field}`}
        label={label}
        value={values[field]}
        onChange={(value) =>
          onChange((current) => ({
            ...current,
            [section]: { ...current[section], [field]: value },
          }))
        }
        options={options}
      />
    );
  }

  return (
    <VStack align="stretch" gap={6} data-testid="add-funder-form">
      <FormIntro
        title={t(source ? "funder-review-title" : "funder-manual-title")}
        description={
          source
            ? t("funder-review-from-document", { filename: source.filename })
            : t("funder-manual-description")
        }
        source={source}
        lng={lng}
      />

      <VStack align="stretch" gap={4}>
        <Heading as="h4" fontSize="body.md">
          {t("funder-section-funder")}
        </Heading>
        <Grid {...fieldGrid}>
          {textField("funder", "name", "funder-field-name", {
            required: true,
            full: true,
          })}
          {textField("funder", "funder_type", "funder-field-type")}
          {textField("funder", "country", "funder-field-country")}
          {textField("funder", "region", "funder-field-region", { full: true })}
        </Grid>
      </VStack>

      <VStack {...sectionProps}>
        <Heading as="h4" fontSize="body.md">
          {t("funder-section-programme")}
        </Heading>
        <Grid {...fieldGrid}>
          {textField("opportunity", "name", "funder-field-programme-name", {
            required: true,
            full: true,
          })}
          {textField("opportunity", "summary", "funder-field-summary", {
            full: true,
            multiline: true,
          })}
          {textField("opportunity", "applicant_type", "funding-applicants")}
          {textField("opportunity", "region_scope", "funder-field-region")}
          {textField("opportunity", "sector", "funding-sector")}
          {textField("opportunity", "category", "funding-category")}
          {textField(
            "opportunity",
            "instrument_type",
            "funder-field-instrument",
          )}
          {textField("opportunity", "finance_route", "funding-finance-route")}
          {textField("opportunity", "status", "funding-status")}
          {textField("opportunity", "currency", "funder-field-currency")}
          {textField("opportunity", "min_award", "funder-field-min-award", {
            help: "funder-award-help",
          })}
          {textField("opportunity", "max_award", "funder-field-max-award", {
            help: "funder-award-help",
          })}
          {textField("opportunity", "hazards", "funding-hazards", {
            help: "funder-list-help",
          })}
          {textField("opportunity", "interventions", "funding-interventions", {
            help: "funder-list-help",
          })}
        </Grid>
      </VStack>

      <TemplateFieldsSection
        {...props}
        onChange={(update) =>
          onChange((current) => ({ ...current, ...update(current) }))
        }
      />
    </VStack>
  );
}

/** A note's own application template, typed by hand or reviewed from a file. */
export function OwnTemplateForm(props: SourcedFormProps<TemplateForm>) {
  const { source, lng } = props;
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <VStack align="stretch" gap={6} data-testid="own-template-form">
      <FormIntro
        title={t(source ? "template-review-title" : "template-manual-title")}
        description={
          source
            ? t("template-review-from-document", { filename: source.filename })
            : t("template-manual-description")
        }
        source={source}
        lng={lng}
      />
      <TemplateFieldsSection {...props} />
    </VStack>
  );
}

/** Template name, format and the ordered chapters drafting will write. */
function TemplateFieldsSection(props: FormProps<TemplateForm>) {
  const { form, onChange, errors, disabled, lng } = props;
  const { t } = useTranslation(lng, "concept-notes");
  const errorText = (path: string) => (errors[path] ? t(errors[path]) : null);

  function setChapters(update: (rows: ChapterRow[]) => ChapterRow[]): void {
    onChange((current) => ({ ...current, chapters: update(current.chapters) }));
  }
  function setChapter(id: string, patch: Partial<ChapterRow>): void {
    setChapters((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  return (
    <VStack {...sectionProps}>
      <Heading as="h4" fontSize="body.md">
        {t("funding-template-preview")}
      </Heading>
      <Grid {...fieldGrid}>
        {(["template_name", "output_format"] as const).map((field) => (
          <TextField
            key={field}
            {...props}
            path={`template.${field}`}
            label={
              field === "template_name"
                ? "funder-field-template-name"
                : "funder-field-output-format"
            }
            value={form.template[field]}
            onChange={(value) =>
              onChange((current) => ({
                ...current,
                template: { ...current.template, [field]: value },
              }))
            }
            options={{ required: field === "template_name" }}
          />
        ))}
      </Grid>
      {errors["template.chapters"] && (
        <Text
          role="alert"
          fontSize="label.sm"
          color="sentiment.negativeDefault"
        >
          {t(errors["template.chapters"])}
        </Text>
      )}
      <VStack as="ol" align="stretch" gap={0} listStyleType="none" m={0}>
        {form.chapters.map((chapter, index) => {
          const titlePath = `chapter.${chapter.id}.title`;
          return (
            <VStack
              as="li"
              key={chapter.id}
              align="stretch"
              gap={2}
              py={3}
              borderTop="1px solid"
              borderColor="border.neutral"
              data-testid="funder-chapter"
            >
              <HStack align="start" gap={2}>
                <Field
                  flex={1}
                  label={t("funder-field-chapter-title", {
                    index: index + 1,
                  })}
                  required
                  invalid={Boolean(errors[titlePath])}
                  errorText={errorText(titlePath)}
                >
                  <Input
                    size="sm"
                    value={chapter.title}
                    disabled={disabled}
                    onChange={(event) =>
                      setChapter(chapter.id, { title: event.target.value })
                    }
                  />
                </Field>
                <IconButton
                  mt={6}
                  size="sm"
                  variant="ghost"
                  color="content.link"
                  aria-label={t("funder-remove-chapter")}
                  disabled={disabled}
                  onClick={() =>
                    setChapters((rows) =>
                      rows.filter((row) => row.id !== chapter.id),
                    )
                  }
                >
                  <LuTrash2 />
                </IconButton>
              </HStack>
              <TextField
                {...props}
                path={`chapter.${chapter.id}.description`}
                label="funder-field-chapter-description"
                value={chapter.description}
                onChange={(description) =>
                  setChapter(chapter.id, { description })
                }
                options={{ multiline: true, rows: 2 }}
              />
              <TextField
                {...props}
                path={`chapter.${chapter.id}.required_fields`}
                label="funding-required-fields"
                value={chapter.required_fields}
                onChange={(required_fields) =>
                  setChapter(chapter.id, { required_fields })
                }
                options={{ help: "funder-list-help" }}
              />
              <Checkbox
                size="sm"
                checked={chapter.required}
                disabled={disabled}
                onCheckedChange={({ checked }) =>
                  setChapter(chapter.id, { required: checked === true })
                }
              >
                {t("funding-required")}
              </Checkbox>
            </VStack>
          );
        })}
      </VStack>
      <Box>
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => setChapters((rows) => [...rows, emptyChapter()])}
        >
          <Icon as={LuPlus} />
          {t("funder-add-chapter")}
        </Button>
      </Box>
    </VStack>
  );
}
