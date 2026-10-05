import { describe, expect, it } from "@jest/globals";

import {
  emptyFunderForm,
  formFromDraft,
  formToCreateRequest,
  funderApiErrorKey,
  funderImportErrorKey,
  parseAward,
  textValue,
  validateFunderForm,
  withTextValue,
} from "@/components/ConceptNoteWorkspace/funder-form";
import type {
  ConceptNoteFunderImport,
  ConceptNoteFunderImportDraft,
} from "@/util/types";

const draft: ConceptNoteFunderImportDraft = {
  funder: {
    name: "Green Cities Foundation",
    funder_type: "Private foundation",
    country: "United States",
    region: null,
    profile: {
      stated: { purpose: "Helps cities reduce climate risk." },
      derived: {},
    },
  },
  opportunity: {
    name: "Nature-Based Cities Call 2026",
    applicant_type: "Municipal governments",
    category: null,
    sector: "Biodiversity",
    hazards: ["Flooding", "Heat"],
    interventions: [],
    finance_route: null,
    instrument_type: "Grant",
    region_scope: "Latin America",
    min_award: "150000.00",
    max_award: "600000.50",
    currency: "USD",
    status: "Open",
    summary: "Grants for nature-based solutions.",
    known_gaps: ["Co-financing share is not quantified."],
  },
  template: {
    template_name: "Proposal form",
    output_format: "docx",
    chapter_schema: [
      {
        chapter_ref: "applicant_details",
        title: "Applicant details",
        description: "Municipality and legal representative.",
        required: true,
        required_fields: ["municipality_name", "contact_email"],
      },
    ],
  },
  missing: ["funder.region", "opportunity.category"],
};

const source: ConceptNoteFunderImport = {
  import_id: "import-1",
  upload_id: "upload-1",
  filename: "call.pdf",
  status: "ready",
  error_code: null,
  draft,
};

describe("funder form", () => {
  it("requires names, a template and titled chapters", () => {
    const form = emptyFunderForm();
    expect(Object.keys(validateFunderForm(form)).sort()).toEqual(
      [
        "funder.name",
        "opportunity.name",
        "template.template_name",
        `chapter.${form.template.chapters[0]!.id}.title`,
      ].sort(),
    );
    const noChapters = {
      ...form,
      template: { ...form.template, chapters: [] },
    };
    expect(validateFunderForm(noChapters)["template.chapters"]).toBe(
      "funder-error-chapters",
    );
    expect(validateFunderForm(formFromDraft(draft))).toEqual({});
  });

  it("validates award amounts and their order", () => {
    const form = formFromDraft(draft);
    const withAward = (min: string, max: string) =>
      validateFunderForm({
        ...form,
        opportunity: { ...form.opportunity, min_award: min, max_award: max },
      });
    expect(withAward("abc", "")["opportunity.min_award"]).toBe(
      "funder-error-award",
    );
    expect(withAward("-5", "")["opportunity.min_award"]).toBe(
      "funder-error-award",
    );
    expect(withAward("700", "600")["opportunity.max_award"]).toBe(
      "funder-error-award-range",
    );
    expect(withAward("150,000", "600 000")).toEqual({});
    expect(parseAward("")).toBeNull();
    expect(parseAward("1.234")).toBeUndefined();
  });

  it("reads and replaces one text input without touching the original", () => {
    const form = emptyFunderForm();
    const edited = withTextValue(form, "template", "output_format", "DOCX");
    expect(textValue(edited, "template", "output_format")).toBe("DOCX");
    expect(textValue(form, "template", "output_format")).toBe("");
    expect(edited.template.chapters).toBe(form.template.chapters);
  });

  it("fills the form from a draft with lists as comma-separated text", () => {
    const form = formFromDraft(draft);
    expect(form.funder.region).toBe("");
    expect(form.opportunity.hazards).toBe("Flooding, Heat");
    expect(form.opportunity.min_award).toBe("150000");
    expect(form.opportunity.max_award).toBe("600000.5");
    expect(form.template.chapters[0]).toMatchObject({
      chapter_ref: "applicant_details",
      required_fields: "municipality_name, contact_email",
    });
  });

  it("builds the create request, keeping unedited import values", () => {
    const form = formFromDraft(draft);
    form.opportunity.currency = " ";
    form.opportunity.hazards = "Flooding, , Heat, Flooding";
    const request = formToCreateRequest(form, source);
    expect(request.import_id).toBe("import-1");
    expect(request.funder.profile).toEqual(draft.funder.profile);
    expect(request.opportunity).toMatchObject({
      min_award: 150000,
      max_award: 600000.5,
      currency: null,
      category: null,
      hazards: ["Flooding", "Heat"],
      known_gaps: ["Co-financing share is not quantified."],
    });
    expect(request.template.chapter_schema[0]).toEqual({
      chapter_ref: "applicant_details",
      title: "Applicant details",
      description: "Municipality and legal representative.",
      required: true,
      required_fields: ["municipality_name", "contact_email"],
    });

    const typed = formToCreateRequest(emptyFunderForm(), null);
    expect(typed.import_id).toBeNull();
    expect(typed.funder.profile).toEqual({ stated: {}, derived: {} });
    expect(typed.opportunity.known_gaps).toEqual([]);
  });
});

describe("funder errors", () => {
  it("maps failed import codes to copy, treating unknown codes as generic", () => {
    expect(funderImportErrorKey("document_too_long")).toBe(
      "funder-import-error-too-long",
    );
    expect(funderImportErrorKey("extraction_interrupted")).toBe(
      "funder-import-error-interrupted",
    );
    expect(funderImportErrorKey(null)).toBe("funder-import-error-generic");
  });

  it("maps API problem codes and statuses to copy", () => {
    const problem = (code: string, status = 409) => ({
      status,
      data: { detail: { code, message: "x" } },
    });
    expect(funderApiErrorKey(problem("funder_import_changed"))).toBe(
      "funder-error-import-changed",
    );
    expect(funderApiErrorKey(problem("funder_already_added"))).toBe(
      "funder-error-already-added",
    );
    expect(funderApiErrorKey({ status: 422, data: { detail: "bad" } })).toBe(
      "funder-error-invalid",
    );
    expect(funderApiErrorKey({ status: 500, data: null })).toBe(
      "funder-error-generic",
    );
  });
});
