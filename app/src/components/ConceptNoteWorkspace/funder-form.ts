import type {
  ConceptNoteFunderCreateRequest,
  ConceptNoteFunderImport,
  ConceptNoteFunderImportDraft,
  ConceptNoteProgrammeFields,
} from "@/util/types";

/**
 * Form state, validation and request building for adding a funder, one
 * programme and its application template to the CNB catalogue. Pure so it is
 * unit-testable. List fields are edited as comma-separated text.
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
const LIST_FIELDS: ReadonlySet<ProgrammeField> = new Set([
  "hazards",
  "interventions",
]);
const AWARD_FIELDS: ReadonlySet<ProgrammeField> = new Set([
  "min_award",
  "max_award",
]);

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

/** A blank form with one empty chapter, used for the by-hand path. */
export function emptyFunderForm(): FunderForm {
  return {
    funder: fieldMap(FUNDER_FIELDS, () => ""),
    opportunity: fieldMap(PROGRAMME_FIELDS, () => ""),
    template: { template_name: "", output_format: "" },
    chapters: [emptyChapter()],
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
  const amount = Number(text.replace(/[ \u00a0\u202f]/g, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : Number.NaN;
}

/** Required names, at least one titled chapter and valid award amounts. */
export function validateFunderForm(form: FunderForm): FunderFormErrors {
  const errors: FunderFormErrors = {};
  if (!form.funder.name.trim()) {
    errors["funder.name"] = "funder-error-funder-name";
  }
  if (!form.opportunity.name.trim()) {
    errors["opportunity.name"] = "funder-error-programme-name";
  }
  if (!form.template.template_name.trim()) {
    errors["template.template_name"] = "funder-error-template-name";
  }
  if (!form.chapters.length) {
    errors["template.chapters"] = "funder-error-chapters";
  }
  for (const chapter of form.chapters) {
    if (!chapter.title.trim()) {
      errors[`chapter.${chapter.id}.title`] = "funder-error-chapter-title";
    }
  }
  const min = parseAward(form.opportunity.min_award);
  const max = parseAward(form.opportunity.max_award);
  if (Number.isNaN(min)) errors["opportunity.min_award"] = "funder-error-award";
  if (Number.isNaN(max)) errors["opportunity.max_award"] = "funder-error-award";
  // Comparisons with NaN are false, so an invalid amount skips this check.
  if (min !== null && max !== null && min > max) {
    errors["opportunity.max_award"] = "funder-error-award-range";
  }
  return errors;
}

/** Request value for one programme input. */
function programmeValue(
  field: ProgrammeField,
  value: string,
): string | string[] | number | null {
  if (LIST_FIELDS.has(field)) return splitList(value);
  if (AWARD_FIELDS.has(field)) return parseAward(value);
  return optionalText(value);
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
  return {
    funder: {
      ...fieldMap(FUNDER_FIELDS, (field) => optionalText(form.funder[field])),
      name: form.funder.name.trim(),
      profile: source?.draft?.funder.profile ?? { stated: {}, derived: {} },
    },
    opportunity: {
      // Each field's value type follows `programmeValue`.
      ...(fieldMap(PROGRAMME_FIELDS, (field) =>
        programmeValue(field, form.opportunity[field]),
      ) as Omit<ConceptNoteProgrammeFields, "known_gaps">),
      name: form.opportunity.name.trim(),
      known_gaps: source?.draft?.opportunity.known_gaps ?? [],
    },
    template: {
      template_name: form.template.template_name.trim(),
      output_format: optionalText(form.template.output_format),
      chapter_schema: form.chapters.map((chapter) => ({
        chapter_ref: chapter.chapter_ref,
        title: chapter.title.trim(),
        description: optionalText(chapter.description),
        required: chapter.required,
        required_fields: splitList(chapter.required_fields),
      })),
    },
    import_id: source?.import_id ?? null,
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
