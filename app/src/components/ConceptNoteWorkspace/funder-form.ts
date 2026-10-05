import type {
  ConceptNoteFunderCreateRequest,
  ConceptNoteFunderImport,
  ConceptNoteFunderImportDraft,
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
  template: {
    template_name: string;
    output_format: string;
    chapters: ChapterRow[];
  };
}

/** Text inputs of each form section, so field names are checked per section. */
export interface FunderTextFields {
  funder: FunderField;
  opportunity: ProgrammeField;
  template: "template_name" | "output_format";
}

/** Read one text input of the form. */
export function textValue<S extends keyof FunderTextFields>(
  form: FunderForm,
  section: S,
  field: FunderTextFields[S],
): string {
  const values = form[section] as unknown as Record<
    FunderTextFields[S],
    string
  >;
  return values[field];
}

/** A copy of the form with one text input changed. */
export function withTextValue<S extends keyof FunderTextFields>(
  form: FunderForm,
  section: S,
  field: FunderTextFields[S],
  value: string,
): FunderForm {
  return { ...form, [section]: { ...form[section], [field]: value } };
}

/** Error keys (i18n) by field path; `chapter.<rowId>.title` for chapters. */
export type FunderFormErrors = Record<string, string>;

let nextRowId = 0;

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
  const blank = <K extends string>(fields: readonly K[]) =>
    Object.fromEntries(fields.map((field) => [field, ""])) as Record<K, string>;
  return {
    funder: blank(FUNDER_FIELDS),
    opportunity: blank(PROGRAMME_FIELDS),
    template: {
      template_name: "",
      output_format: "",
      chapters: [emptyChapter()],
    },
  };
}

function joinList(values: string[]): string {
  return values.join(", ");
}

function splitList(value: string): string[] {
  const items = value.split(",").map((item) => item.trim());
  return [...new Set(items.filter(Boolean))];
}

function optionalText(value: string): string | null {
  return value.trim() || null;
}

/** Fill a form with everything a ready document import extracted. */
export function formFromDraft(draft: ConceptNoteFunderImportDraft): FunderForm {
  const form = emptyFunderForm();
  for (const field of FUNDER_FIELDS) {
    form.funder[field] = draft.funder[field] ?? "";
  }
  for (const field of PROGRAMME_FIELDS) {
    const value = draft.opportunity[field];
    if (Array.isArray(value)) form.opportunity[field] = joinList(value);
    else if (value !== null) form.opportunity[field] = String(value);
  }
  // Awards arrive as decimal strings such as "150000.00".
  for (const field of ["min_award", "max_award"] as const) {
    const award = Number(form.opportunity[field]);
    if (form.opportunity[field] && Number.isFinite(award)) {
      form.opportunity[field] = String(award);
    }
  }
  form.template.template_name = draft.template.template_name;
  form.template.output_format = draft.template.output_format ?? "";
  // A document without chapters keeps one empty chapter to type into.
  if (draft.template.chapter_schema.length) {
    form.template.chapters = draft.template.chapter_schema.map((chapter) => ({
      ...emptyChapter(),
      chapter_ref: chapter.chapter_ref,
      title: chapter.title,
      description: chapter.description ?? "",
      required: chapter.required,
      required_fields: joinList(chapter.required_fields),
    }));
  }
  return form;
}

/** Parse an award input: empty is null, invalid input is undefined. */
export function parseAward(value: string): number | null | undefined {
  const text = value.trim().replace(/[\s,]/g, "");
  if (!text) return null;
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : undefined;
}

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
  if (!form.template.chapters.length) {
    errors["template.chapters"] = "funder-error-chapters";
  }
  for (const chapter of form.template.chapters) {
    if (!chapter.title.trim()) {
      errors[`chapter.${chapter.id}.title`] = "funder-error-chapter-title";
    }
  }
  const min = parseAward(form.opportunity.min_award);
  const max = parseAward(form.opportunity.max_award);
  if (min === undefined) errors["opportunity.min_award"] = "funder-error-award";
  if (max === undefined) errors["opportunity.max_award"] = "funder-error-award";
  if (typeof min === "number" && typeof max === "number" && min > max) {
    errors["opportunity.max_award"] = "funder-error-award-range";
  }
  return errors;
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
  const { opportunity } = form;
  return {
    funder: {
      name: form.funder.name.trim(),
      funder_type: optionalText(form.funder.funder_type),
      country: optionalText(form.funder.country),
      region: optionalText(form.funder.region),
      profile: source?.draft?.funder.profile ?? { stated: {}, derived: {} },
    },
    opportunity: {
      name: opportunity.name.trim(),
      applicant_type: optionalText(opportunity.applicant_type),
      category: optionalText(opportunity.category),
      sector: optionalText(opportunity.sector),
      hazards: splitList(opportunity.hazards),
      interventions: splitList(opportunity.interventions),
      finance_route: optionalText(opportunity.finance_route),
      instrument_type: optionalText(opportunity.instrument_type),
      region_scope: optionalText(opportunity.region_scope),
      min_award: parseAward(opportunity.min_award) ?? null,
      max_award: parseAward(opportunity.max_award) ?? null,
      currency: optionalText(opportunity.currency),
      status: optionalText(opportunity.status),
      summary: optionalText(opportunity.summary),
      known_gaps: source?.draft?.opportunity.known_gaps ?? [],
    },
    template: {
      template_name: form.template.template_name.trim(),
      output_format: optionalText(form.template.output_format),
      chapter_schema: form.template.chapters.map((chapter) => ({
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

/** Copy for an import that finished with `status: "failed"`. */
export function funderImportErrorKey(code: string | null): string {
  switch (code) {
    case "document_too_long":
      return "funder-import-error-too-long";
    case "extraction_interrupted":
      return "funder-import-error-interrupted";
    default:
      return "funder-import-error-generic";
  }
}

/** Machine-readable code from a Climate Advisor problem response, if any. */
export function funderApiErrorCode(error: unknown): string | null {
  const detail = (error as { data?: { detail?: { code?: unknown } } } | null)
    ?.data?.detail;
  return typeof detail?.code === "string" ? detail.code : null;
}

/** Copy for a failed funder import or create request. */
export function funderApiErrorKey(error: unknown): string {
  switch (funderApiErrorCode(error)) {
    case "upload_not_ready":
      return "funder-error-upload-not-ready";
    case "funder_import_running":
      return "funder-error-import-running";
    case "funder_import_changed":
      return "funder-error-import-changed";
    case "funder_already_added":
      return "funder-error-already-added";
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 400 || status === 422) return "funder-error-invalid";
  if (status === 403) return "funding-permission-error";
  return "funder-error-generic";
}
