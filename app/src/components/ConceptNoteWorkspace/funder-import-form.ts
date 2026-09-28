import type {
  ConceptNoteFieldEvidence,
  ConceptNoteFunderCreateRequest,
  ConceptNoteFunderImportDraft,
} from "@/util/types";

/**
 * Form state, validation and per-field provenance for adding a funder to the
 * CNB catalogue from a document import or by hand. Pure so it is unit-testable.
 *
 * Field paths match the Climate Advisor contract used by `evidence[].field`
 * and `missing[]`, e.g. `funder.name`, `opportunity.min_award`,
 * `funder.profile.stated.<key>` and `template.chapter_schema.<chapter_ref>`.
 */

export type FactGroup = "stated" | "derived";

export interface FactRow {
  id: string;
  key: string;
  value: string;
}

export interface ChapterRow {
  id: string;
  /** Empty for chapters added in the form; the server derives one. */
  chapter_ref: string;
  title: string;
  description: string;
  required: boolean;
  required_fields: string[];
}

export const FUNDER_TEXT_FIELDS = [
  "name",
  "funder_type",
  "country",
  "region",
] as const;
export type FunderTextField = (typeof FUNDER_TEXT_FIELDS)[number];

export const PROGRAMME_TEXT_FIELDS = [
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
] as const;
export type ProgrammeTextField = (typeof PROGRAMME_TEXT_FIELDS)[number];

export const PROGRAMME_LIST_FIELDS = [
  "hazards",
  "interventions",
  "known_gaps",
] as const;
export type ProgrammeListField = (typeof PROGRAMME_LIST_FIELDS)[number];

export interface FunderForm {
  funder: Record<FunderTextField, string> & Record<FactGroup, FactRow[]>;
  opportunity: Record<ProgrammeTextField, string> &
    Record<ProgrammeListField, string[]>;
  template: {
    template_name: string;
    output_format: string;
    chapters: ChapterRow[];
  };
}

export type Provenance = "document" | "edited" | "entered" | "missing";

let nextRowId = 0;
function rowId(): string {
  nextRowId += 1;
  return `row-${nextRowId}`;
}

export function emptyChapter(): ChapterRow {
  return {
    id: rowId(),
    chapter_ref: "",
    title: "",
    description: "",
    required: true,
    required_fields: [],
  };
}

export function emptyFact(): FactRow {
  return { id: rowId(), key: "", value: "" };
}

/** A blank form with one empty chapter, used for the by-hand path. */
export function emptyFunderForm(): FunderForm {
  return {
    funder: {
      name: "",
      funder_type: "",
      country: "",
      region: "",
      stated: [],
      derived: [],
    },
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
      hazards: [],
      interventions: [],
      known_gaps: [],
    },
    template: {
      template_name: "",
      output_format: "",
      chapters: [emptyChapter()],
    },
  };
}

function awardText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : String(value);
}

function factRows(facts: Record<string, string>): FactRow[] {
  return Object.entries(facts).map(([key, value]) => ({
    id: rowId(),
    key,
    value,
  }));
}

function chapterRows(draft: ConceptNoteFunderImportDraft): ChapterRow[] {
  return draft.template.chapter_schema.map((chapter) => ({
    id: rowId(),
    chapter_ref: chapter.chapter_ref,
    title: chapter.title,
    description: chapter.description ?? "",
    required: chapter.required,
    required_fields: [...chapter.required_fields],
  }));
}

/** Fill a form with everything a ready import extracted. */
export function formFromDraft(draft: ConceptNoteFunderImportDraft): FunderForm {
  // A document without chapters keeps one empty chapter to type into.
  return fillEmptyFromDraft(emptyFunderForm(), draft);
}

function isBlankChapter(chapter: ChapterRow): boolean {
  return (
    !chapter.title.trim() &&
    !chapter.description.trim() &&
    chapter.required_fields.length === 0
  );
}

/**
 * Copy draft values into fields that are still empty, keeping anything the
 * user already typed (used when a document is attached after typing).
 */
export function fillEmptyFromDraft(
  form: FunderForm,
  draft: ConceptNoteFunderImportDraft,
): FunderForm {
  const funder = { ...form.funder };
  for (const field of FUNDER_TEXT_FIELDS) {
    if (!funder[field].trim()) funder[field] = draft.funder[field] ?? "";
  }
  for (const group of ["stated", "derived"] as const) {
    const present = new Set(funder[group].map((row) => row.key.trim()));
    const kept = funder[group].filter(
      (row) => row.key.trim() || row.value.trim(),
    );
    funder[group] = [
      ...kept,
      ...factRows(draft.funder.profile[group]).filter(
        (row) => !present.has(row.key),
      ),
    ];
  }
  const opportunity = { ...form.opportunity };
  for (const field of PROGRAMME_TEXT_FIELDS) {
    if (opportunity[field].trim()) continue;
    const value = draft.opportunity[field];
    opportunity[field] =
      field === "min_award" || field === "max_award"
        ? awardText(value)
        : ((value as string | null) ?? "");
  }
  for (const field of PROGRAMME_LIST_FIELDS) {
    if (!opportunity[field].length) {
      opportunity[field] = [...draft.opportunity[field]];
    }
  }
  const template = { ...form.template };
  if (!template.template_name.trim()) {
    template.template_name = draft.template.template_name;
  }
  if (!template.output_format.trim()) {
    template.output_format = draft.template.output_format ?? "";
  }
  if (template.chapters.every(isBlankChapter)) {
    const chapters = chapterRows(draft);
    template.chapters = chapters.length ? chapters : template.chapters;
  }
  return { funder, opportunity, template };
}

/** Parse an award input: empty is null, invalid input is undefined. */
export function parseAward(value: string): number | null | undefined {
  const text = value.trim().replace(/[\s,]/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionalText(value: string): string | null {
  const text = value.trim();
  return text ? text : null;
}

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function factRecord(rows: FactRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key && value) record[key] = value;
  }
  return record;
}

/** Build the create request; call only when `validateFunderForm` is empty. */
export function formToCreateRequest(
  form: FunderForm,
  importId: string | null,
): ConceptNoteFunderCreateRequest {
  return {
    funder: {
      name: form.funder.name.trim(),
      funder_type: optionalText(form.funder.funder_type),
      country: optionalText(form.funder.country),
      region: optionalText(form.funder.region),
      profile: {
        stated: factRecord(form.funder.stated),
        derived: factRecord(form.funder.derived),
      },
    },
    opportunity: {
      name: form.opportunity.name.trim(),
      applicant_type: optionalText(form.opportunity.applicant_type),
      category: optionalText(form.opportunity.category),
      sector: optionalText(form.opportunity.sector),
      hazards: cleanList(form.opportunity.hazards),
      interventions: cleanList(form.opportunity.interventions),
      finance_route: optionalText(form.opportunity.finance_route),
      instrument_type: optionalText(form.opportunity.instrument_type),
      region_scope: optionalText(form.opportunity.region_scope),
      min_award: parseAward(form.opportunity.min_award) ?? null,
      max_award: parseAward(form.opportunity.max_award) ?? null,
      currency: optionalText(form.opportunity.currency),
      status: optionalText(form.opportunity.status),
      summary: optionalText(form.opportunity.summary),
      known_gaps: cleanList(form.opportunity.known_gaps),
    },
    template: {
      template_name: form.template.template_name.trim(),
      output_format: optionalText(form.template.output_format),
      chapter_schema: form.template.chapters.map((chapter) => ({
        chapter_ref: chapter.chapter_ref,
        title: chapter.title.trim(),
        description: optionalText(chapter.description),
        required: chapter.required,
        required_fields: cleanList(chapter.required_fields),
      })),
    },
    import_id: importId,
  };
}

/** Error keys (i18n) by field path; `chapter.<rowId>.title` for chapters. */
export type FunderFormErrors = Record<string, string>;

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
    errors["template.chapter_schema"] = "funder-error-chapters";
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

// --- Provenance ------------------------------------------------------------

type Comparable = string | string[] | Record<string, unknown> | null;

function chapterComparable(chapter: {
  title: string;
  description: string | null;
  required: boolean;
  required_fields: string[];
}): Record<string, unknown> {
  return {
    title: chapter.title.trim(),
    description: chapter.description?.trim() || null,
    required: chapter.required,
    required_fields: cleanList(chapter.required_fields),
  };
}

function comparable(path: string, value: unknown): Comparable {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const list = cleanList(value.map(String));
    return list.length ? list : null;
  }
  if (typeof value === "object") {
    if (!path.startsWith("template.chapter_schema.")) {
      return value as Record<string, unknown>;
    }
    const chapter = chapterComparable(value as ChapterRow);
    const blank =
      !chapter.title &&
      !chapter.description &&
      !(chapter.required_fields as string[]).length;
    return blank ? null : chapter;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (path === "opportunity.min_award" || path === "opportunity.max_award") {
    const numeric = Number(text.replace(/[\s,]/g, ""));
    return Number.isFinite(numeric) ? String(numeric) : text;
  }
  return text;
}

function sameValue(a: Comparable, b: Comparable): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Value stored in the import draft at a field path, if any. */
export function draftValue(
  draft: ConceptNoteFunderImportDraft,
  path: string,
): unknown {
  const [entity, ...rest] = path.split(".");
  const field = rest.join(".");
  if (entity === "funder") {
    if (field.startsWith("profile.")) {
      const [, group, ...key] = field.split(".");
      return draft.funder.profile[group as FactGroup]?.[key.join(".")];
    }
    return draft.funder[field as keyof typeof draft.funder];
  }
  if (entity === "opportunity") {
    return draft.opportunity[field as keyof typeof draft.opportunity];
  }
  if (entity === "template") {
    if (field.startsWith("chapter_schema.")) {
      const ref = field.slice("chapter_schema.".length);
      return ref
        ? draft.template.chapter_schema.find(
            (chapter) => chapter.chapter_ref === ref,
          )
        : undefined;
    }
    return draft.template[field as keyof typeof draft.template];
  }
  return undefined;
}

/** Evidence quotes for any of the given paths, without duplicates. */
export function evidenceFor(
  draft: ConceptNoteFunderImportDraft | null,
  paths: string[],
): ConceptNoteFieldEvidence[] {
  if (!draft) return [];
  const seen = new Set<string>();
  return draft.evidence.filter((item) => {
    if (!paths.includes(item.field) || seen.has(item.quote)) return false;
    seen.add(item.quote);
    return true;
  });
}

/**
 * Where a field's current value came from:
 * - "document": unchanged from what the import extracted
 * - "edited": the import had a value and the user changed or cleared it
 * - "entered": typed by hand where the import had nothing
 * - "missing": the import reported it absent and it is still empty
 * Returns null for an empty field with nothing to report.
 */
export function fieldProvenance(
  draft: ConceptNoteFunderImportDraft | null,
  path: string,
  current: unknown,
): Provenance | null {
  const value = comparable(path, current);
  if (!draft) return value === null ? null : "entered";
  if (value === null && draft.missing.includes(path)) return "missing";
  const original = comparable(path, draftValue(draft, path));
  const hasEvidence = draft.evidence.some((item) => item.field === path);
  if (original !== null || hasEvidence) {
    return sameValue(value, original) ? "document" : "edited";
  }
  return value === null ? null : "entered";
}

/** One provenance for fields shown together, e.g. the award range. */
export function groupProvenance(
  draft: ConceptNoteFunderImportDraft | null,
  entries: Array<[path: string, current: unknown]>,
): Provenance | null {
  const states = entries.map(([path, current]) =>
    fieldProvenance(draft, path, current),
  );
  if (
    states.includes("edited") ||
    (states.includes("document") && states.includes("entered"))
  ) {
    return "edited";
  }
  if (states.includes("document")) return "document";
  if (states.includes("entered")) return "entered";
  if (states.includes("missing")) return "missing";
  return null;
}

/** Readable original draft value for the "Show original" toggle. */
export function originalDisplay(
  draft: ConceptNoteFunderImportDraft | null,
  path: string,
): string {
  if (!draft) return "";
  const value = draftValue(draft, path);
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    return (value as { title?: string }).title ?? "";
  }
  return path.endsWith("_award") ? awardText(value as string) : String(value);
}

// --- Errors ------------------------------------------------------------------

/** Copy for an import that finished with `status: "failed"`. */
export function funderImportErrorKey(code: string | null): string {
  switch (code) {
    case "document_too_long":
      return "funder-import-error-too-long";
    case "extraction_interrupted":
      return "funder-import-error-interrupted";
    case "source_fetch_failed":
    case "upload_not_ready":
      return "funder-import-error-source";
    default:
      return "funder-import-error-generic";
  }
}

/** Machine-readable code from a Climate Advisor problem response, if any. */
export function funderApiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data: unknown }).data;
  if (!data || typeof data !== "object" || !("detail" in data)) return null;
  const detail = (data as { detail: unknown }).detail;
  return detail &&
    typeof detail === "object" &&
    "code" in detail &&
    typeof detail.code === "string"
    ? detail.code
    : null;
}

/** Copy for a failed funder import or create request. */
export function funderApiErrorKey(error: unknown): string {
  switch (funderApiErrorCode(error)) {
    case "upload_not_found":
      return "funder-error-upload-not-found";
    case "upload_not_ready":
      return "funder-error-upload-not-ready";
    case "funder_import_running":
      return "funder-error-import-running";
    case "funder_import_not_failed":
    case "funder_import_changed":
      return "funder-error-import-changed";
    case "funder_already_added":
      return "funder-error-already-added";
  }
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status: unknown }).status
      : null;
  if (status === 400 || status === 422) return "funder-error-invalid";
  if (status === 403) return "funding-permission-error";
  return "funder-error-generic";
}
