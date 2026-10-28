import Decimal from "decimal.js";
import type { ZodIssue } from "zod";
import {
  conceptNoteFunderCreateRequest,
  conceptNoteTemplateFields,
} from "@/util/concept-note-funder";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteCustomTemplateRequest,
  ConceptNoteFunderCreateRequest,
  ConceptNoteFunderImport,
  ConceptNoteFunderImportDraft,
  ConceptNoteTemplateFields,
} from "@/util/types";

/**
 * Form state, validation and request building for adding a funder, one
 * programme and its application template to the CNB catalogue, or for a
 * note's own template (the template part alone). Pure so it is unit-testable.
 * List fields are edited as comma-separated text.
 */

const FUNDER_FIELDS = ["name", "funder_type", "country", "region"] as const;
type FunderField = (typeof FUNDER_FIELDS)[number];

const PROGRAMME_FIELDS = [
  "name",
  "summary",
  "applicant_type",
  "region_scope",
  "sector",
  "category",
  "instrument_type",
  "finance_route",
  "status",
  "min_award",
  "max_award",
  "currency",
  "hazards",
  "interventions",
] as const;
type ProgrammeField = (typeof PROGRAMME_FIELDS)[number];
type TemplateField = "template_name" | "output_format";

export interface ChapterRow {
  id: string;
  /** Empty for chapters added in the form; the server derives one. */
  chapter_ref: string;
  title: string;
  description: string;
  required: boolean;
  required_fields: string;
}

export interface FunderForm {
  funder: Record<FunderField, string>;
  opportunity: Record<ProgrammeField, string>;
  template: Record<TemplateField, string>;
  chapters: ChapterRow[];
}

/** The template part of the form, also used alone for a note's own template. */
export type TemplateForm = Pick<FunderForm, "template" | "chapters">;

/** Form sections made only of text inputs. */
export type FunderTextSection = Exclude<keyof FunderForm, "chapters">;

/** Error keys (i18n) by field path; `chapter.<rowId>.title` for chapters. */
export type FunderFormErrors = Record<string, string>;

/** One value per field name. */
function fieldMap<K extends string, V>(
  fields: readonly K[],
  value: (field: K) => V,
): Record<K, V> {
  return Object.fromEntries(
    fields.map((field) => [field, value(field)]),
  ) as Record<K, V>;
}

let nextRowId = 0;

/** A blank required chapter with a row id unique to this page. */
export function emptyChapter(): ChapterRow {
  nextRowId += 1;
  return {
    id: `chapter-${nextRowId}`,
    chapter_ref: "",
    title: "",
    description: "",
    required: true,
    required_fields: "",
  };
}

/** A blank template with one empty chapter. */
export function emptyTemplateForm(): TemplateForm {
  return {
    template: { template_name: "", output_format: "" },
    chapters: [emptyChapter()],
  };
}

/** A blank form with one empty chapter, used for the by-hand path. */
export function emptyFunderForm(): FunderForm {
  return {
    funder: fieldMap(FUNDER_FIELDS, () => ""),
    opportunity: fieldMap(PROGRAMME_FIELDS, () => ""),
    ...emptyTemplateForm(),
  };
}

function splitList(value: string): string[] {
  const items = value.split(",").map((item) => item.trim());
  return [...new Set(items.filter(Boolean))];
}

function optionalText(value: string): string | null {
  return value.trim() || null;
}

/** Text for one input; lists become comma-separated. */
function inputText(value: string | string[] | number | null): string {
  if (Array.isArray(value)) return value.join(", ");
  return value === null ? "" : String(value);
}

/** Fill a form with everything a ready document import extracted. */
export function formFromDraft(draft: ConceptNoteFunderImportDraft): FunderForm {
  const { funder, opportunity, template } = draft;
  return {
    funder: fieldMap(FUNDER_FIELDS, (field) => inputText(funder[field])),
    opportunity: fieldMap(PROGRAMME_FIELDS, (field) =>
      inputText(opportunity[field]),
    ),
    ...templateFormFrom(template),
  };
}

/** Fill the template part from reviewed or extracted template fields. */
export function templateFormFrom(
  template: ConceptNoteTemplateFields,
): TemplateForm {
  return {
    template: {
      template_name: template.template_name,
      output_format: inputText(template.output_format),
    },
    // A document without chapters keeps one empty chapter to type into.
    chapters: template.chapter_schema.length
      ? template.chapter_schema.map((chapter) => ({
          ...emptyChapter(),
          chapter_ref: chapter.chapter_ref,
          title: chapter.title,
          description: inputText(chapter.description),
          required: chapter.required,
          required_fields: inputText(chapter.required_fields),
        }))
      : [emptyChapter()],
  };
}

/** Template fields of a saved template, to edit it again. */
export function templateFieldsFromContext(
  template: NonNullable<ConceptNoteApplicationContext["template"]>,
): ConceptNoteTemplateFields {
  return {
    template_name: template.name,
    output_format: template.output_format,
    chapter_schema: template.chapter_schema.map((chapter) => ({
      chapter_ref: chapter.chapter_ref,
      title: chapter.title,
      description: chapter.description ?? null,
      required: chapter.required ?? false,
      required_fields: chapter.required_fields ?? [],
    })),
  };
}

/**
 * Accept decimal dots/commas and space-grouped thousands; reject ambiguity.
 * Returns `null` for an empty input and `NaN` for an invalid amount.
 */
export function parseAward(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (
    !/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?$/.test(text)
  ) {
    return Number.NaN;
  }
  const decimal = new Decimal(
    text.replace(/[ \u00a0\u202f]/g, "").replace(",", "."),
  );
  const amount = decimal.toNumber();
  return Number.isFinite(amount) && decimal.equals(amount)
    ? amount
    : Number.NaN;
}

/** Map request issues to stable chapter IDs so field errors survive row edits. */
function fieldErrors(issues: ZodIssue[], form: TemplateForm): FunderFormErrors {
  const errors: FunderFormErrors = {};
  for (const issue of issues) {
    let path = issue.path.join(".");
    if (issue.path[1] === "chapter_schema") {
      const row = form.chapters[Number(issue.path[2])];
      path = row ? `chapter.${row.id}.${issue.path[3]}` : "template.chapters";
    }
    errors[path] ??= issue.message;
  }
  return errors;
}

export function validateTemplateForm(form: TemplateForm): FunderFormErrors {
  const result = conceptNoteTemplateFields.safeParse(templateFromForm(form));
  return result.success
    ? {}
    : fieldErrors(
        result.error.issues.map((issue) => ({
          ...issue,
          path: ["template", ...issue.path],
        })),
        form,
      );
}

export function validateFunderForm(form: FunderForm): FunderFormErrors {
  const result = conceptNoteFunderCreateRequest.safeParse(
    formToCreateRequest(form, null),
  );
  return result.success ? {} : fieldErrors(result.error.issues, form);
}

/**
 * Build the create request; call only when `validateFunderForm` is empty.
 * Values the form does not edit (profile facts, known gaps) come from the
 * reviewed document import, if any.
 */
export function formToCreateRequest(
  form: FunderForm,
  source: ConceptNoteFunderImport | null,
): ConceptNoteFunderCreateRequest {
  const { funder, opportunity } = form;
  return {
    funder: {
      name: funder.name.trim(),
      funder_type: optionalText(funder.funder_type),
      country: optionalText(funder.country),
      region: optionalText(funder.region),
      profile: source?.draft?.funder.profile ?? { stated: {}, derived: {} },
    },
    opportunity: {
      name: opportunity.name.trim(),
      summary: optionalText(opportunity.summary),
      applicant_type: optionalText(opportunity.applicant_type),
      region_scope: optionalText(opportunity.region_scope),
      sector: optionalText(opportunity.sector),
      category: optionalText(opportunity.category),
      instrument_type: optionalText(opportunity.instrument_type),
      finance_route: optionalText(opportunity.finance_route),
      status: optionalText(opportunity.status),
      min_award: parseAward(opportunity.min_award),
      max_award: parseAward(opportunity.max_award),
      currency: optionalText(opportunity.currency),
      hazards: splitList(opportunity.hazards),
      interventions: splitList(opportunity.interventions),
      known_gaps: source?.draft?.opportunity.known_gaps ?? [],
    },
    template: templateFromForm(form),
    import_id: source?.import_id ?? null,
  };
}

/** Template fields; call only when `validateTemplateForm` is empty. */
export function templateFromForm(
  form: TemplateForm,
): ConceptNoteTemplateFields {
  return {
    template_name: form.template.template_name.trim(),
    output_format: optionalText(form.template.output_format),
    chapter_schema: form.chapters.map((chapter) => ({
      chapter_ref: chapter.chapter_ref,
      title: chapter.title.trim(),
      description: optionalText(chapter.description),
      required: chapter.required,
      required_fields: splitList(chapter.required_fields),
    })),
  };
}

/** A note's own template, reviewed from a template import when given. */
export function ownTemplateRequest(
  form: TemplateForm,
  source: ConceptNoteFunderImport | null,
): ConceptNoteCustomTemplateRequest {
  return {
    template: templateFromForm(form),
    import_id: source?.import_id ?? null,
  };
}

/** Preview of an own template before it is saved; the server assigns refs. */
export function templatePreview(
  template: ConceptNoteTemplateFields,
): NonNullable<ConceptNoteApplicationContext["template"]> {
  return {
    id: "",
    name: template.template_name,
    output_format: template.output_format,
    chapter_schema: template.chapter_schema,
    required_fields: [
      ...new Set(template.chapter_schema.flatMap((c) => c.required_fields)),
    ],
  };
}

// --- Errors ------------------------------------------------------------------

const IMPORT_ERROR_KEYS = new Map([
  ["document_too_long", "funder-import-error-too-long"],
  ["extraction_interrupted", "funder-import-error-interrupted"],
  ["upload_failed", "funder-upload-failed"],
]);

const API_ERROR_KEYS = new Map([
  ["funder_import_running", "funder-error-import-running"],
  ["funder_import_pending", "funder-error-draft-pending"],
  ["funder_import_changed", "funder-error-import-changed"],
  ["funder_already_added", "funder-error-already-added"],
]);

/** Copy for an import that finished with `status: "failed"`. */
export function funderImportErrorKey(code: string | null): string {
  return IMPORT_ERROR_KEYS.get(code ?? "") ?? "funder-import-error-generic";
}

/** Machine-readable code from a Climate Advisor problem response, if any. */
export function funderApiErrorCode(error: unknown): string | null {
  const detail = (error as { data?: { detail?: { code?: unknown } } } | null)
    ?.data?.detail;
  return typeof detail?.code === "string" ? detail.code : null;
}

/** Copy for a failed funder import or create request. */
export function funderApiErrorKey(error: unknown): string {
  const byCode = API_ERROR_KEYS.get(funderApiErrorCode(error) ?? "");
  if (byCode) return byCode;
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 400 || status === 422) return "funder-error-invalid";
  if (status === 403) return "funding-permission-error";
  return "funder-error-generic";
}
