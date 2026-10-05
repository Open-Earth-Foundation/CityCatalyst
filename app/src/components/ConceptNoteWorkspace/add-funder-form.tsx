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

import {
  emptyChapter,
  type ChapterRow,
  type FunderForm,
  type FunderFormErrors,
  type FunderTextSection,
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
  help?: string;
}

interface AddFunderFormProps {
  form: FunderForm;
  onChange: (update: (form: FunderForm) => FunderForm) => void;
  /** Errors to show; empty until the user first tries to add the funder. */
  errors: FunderFormErrors;
  disabled?: boolean;
  lng: string;
}

/** Editable funder, programme and application template (`funding-details.tsx` fields). */
export function AddFunderForm({
  form,
  onChange,
  errors,
  disabled,
  lng,
}: AddFunderFormProps) {
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

  function textField<S extends FunderTextSection>(
    section: S,
    field: keyof FunderForm[S] & string,
    labelKey: string,
    { required, full, multiline, help }: TextFieldOptions = {},
  ): ReactNode {
    const path = `${section}.${field}`;
    const Control = multiline ? Textarea : Input;
    const values: Record<string, string> = form[section];
    return (
      <Field
        key={path}
        label={t(labelKey)}
        required={required}
        invalid={Boolean(errors[path])}
        errorText={errorText(path)}
        helperText={help ? t(help) : undefined}
        gridColumn={full ? "1 / -1" : undefined}
      >
        <Control
          size="sm"
          value={values[field]}
          disabled={disabled}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              [section]: { ...current[section], [field]: event.target.value },
            }))
          }
        />
      </Field>
    );
  }

  return (
    <VStack align="stretch" gap={6} data-testid="add-funder-form">
      <Box>
        <Heading as="h3" fontSize="title.md">
          {t("funder-manual-title")}
        </Heading>
        <Text mt={1} fontSize="body.sm" color="content.secondary">
          {t("funder-manual-description")}
        </Text>
      </Box>

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

      <VStack {...sectionProps}>
        <Heading as="h4" fontSize="body.md">
          {t("funding-template-preview")}
        </Heading>
        <Grid {...fieldGrid}>
          {textField(
            "template",
            "template_name",
            "funder-field-template-name",
            {
              required: true,
            },
          )}
          {textField("template", "output_format", "funder-field-output-format")}
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
                <Textarea
                  size="sm"
                  rows={2}
                  value={chapter.description}
                  aria-label={t("funder-field-chapter-description")}
                  placeholder={t("funder-field-chapter-description")}
                  disabled={disabled}
                  onChange={(event) =>
                    setChapter(chapter.id, { description: event.target.value })
                  }
                />
                <Field
                  label={t("funding-required-fields")}
                  helperText={t("funder-list-help")}
                >
                  <Input
                    size="sm"
                    value={chapter.required_fields}
                    disabled={disabled}
                    onChange={(event) =>
                      setChapter(chapter.id, {
                        required_fields: event.target.value,
                      })
                    }
                  />
                </Field>
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
    </VStack>
  );
}
