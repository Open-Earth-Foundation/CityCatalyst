import type { ConceptNoteFunderCreateRequest } from "@/util/types";

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

function splitList(value: string): string[] {
  const items = value.split(",").map((item) => item.trim());
  return [...new Set(items.filter(Boolean))];
}

function optionalText(value: string): string | null {
  return value.trim() || null;
}

/** Parse an award input: empty is null, invalid input is undefined. */
export function parseAward(value: string): number | null | undefined {
  const text = value.trim().replace(/[\s,]/g, "");
  if (!text) return null;
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : undefined;
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

/** Build the create request; call only when `validateFunderForm` is empty. */
export function formToCreateRequest(
  form: FunderForm,
): ConceptNoteFunderCreateRequest {
  const { opportunity } = form;
  return {
    funder: {
      name: form.funder.name.trim(),
      funder_type: optionalText(form.funder.funder_type),
      country: optionalText(form.funder.country),
      region: optionalText(form.funder.region),
      profile: { stated: {}, derived: {} },
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
      known_gaps: [],
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
  };
}

/** Copy for a failed create request. */
export function funderApiErrorKey(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 400 || status === 422) return "funder-error-invalid";
  if (status === 403) return "funding-permission-error";
  return "funder-error-generic";
}
