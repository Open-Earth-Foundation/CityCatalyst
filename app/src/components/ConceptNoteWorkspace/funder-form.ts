import Decimal from "decimal.js";
import { conceptNoteFunderCreateRequest } from "@/util/concept-note-funder";
import type { ConceptNoteFunderCreateRequest } from "@/util/types";

/** Text inputs stay strings until the shared request schema validates them. */
export interface FunderForm {
  funder: Record<
    Exclude<keyof ConceptNoteFunderCreateRequest["funder"], "profile">,
    string
  >;
  opportunity: Record<
    Exclude<keyof ConceptNoteFunderCreateRequest["opportunity"], "known_gaps">,
    string
  >;
  template: { template_name: string; output_format: string };
  chapters: ChapterRow[];
}

export interface ChapterRow {
  id: string;
  chapter_ref: string;
  title: string;
  description: string;
  required: boolean;
  required_fields: string;
}

export type FunderTextSection = Exclude<keyof FunderForm, "chapters">;
/** i18n keys by field path; chapters use their stable row ID. */
export type FunderFormErrors = Record<string, string>;

let nextRowId = 0;

export function emptyChapter(): ChapterRow {
  return {
    id: `chapter-${++nextRowId}`,
    chapter_ref: "",
    title: "",
    description: "",
    required: true,
    required_fields: "",
  };
}

export function emptyFunderForm(): FunderForm {
  return {
    funder: { name: "", funder_type: "", country: "", region: "" },
    opportunity: {
      name: "",
      summary: "",
      applicant_type: "",
      region_scope: "",
      sector: "",
      category: "",
      instrument_type: "",
      finance_route: "",
      status: "",
      min_award: "",
      max_award: "",
      currency: "",
      hazards: "",
      interventions: "",
    },
    template: { template_name: "", output_format: "" },
    chapters: [emptyChapter()],
  };
}

function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function optionalText(value: string): string | null {
  return value.trim() || null;
}

/** Accept localized decimals, rejecting ambiguous grouping and precision loss. */
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

/** Map the same schema used by the API to the form's stable field paths. */
export function validateFunderForm(form: FunderForm): FunderFormErrors {
  const result = conceptNoteFunderCreateRequest.safeParse(
    formToCreateRequest(form),
  );
  if (result.success) return {};
  const errors: FunderFormErrors = {};
  for (const issue of result.error.issues) {
    let path = issue.path.join(".");
    if (issue.path[1] === "chapter_schema") {
      const row = form.chapters[Number(issue.path[2])];
      path = row ? `chapter.${row.id}.${issue.path[3]}` : "template.chapters";
    }
    errors[path] ??= issue.message;
  }
  return errors;
}

/** Convert editable fields explicitly; validate before sending the request. */
export function formToCreateRequest(
  form: FunderForm,
): ConceptNoteFunderCreateRequest {
  const { funder, opportunity, template } = form;
  return {
    funder: {
      name: funder.name.trim(),
      funder_type: optionalText(funder.funder_type),
      country: optionalText(funder.country),
      region: optionalText(funder.region),
      profile: { stated: {}, derived: {} },
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
      known_gaps: [],
    },
    template: {
      template_name: template.template_name.trim(),
      output_format: optionalText(template.output_format),
      chapter_schema: form.chapters.map((chapter) => ({
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
