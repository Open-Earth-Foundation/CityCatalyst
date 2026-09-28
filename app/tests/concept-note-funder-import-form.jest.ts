import { describe, expect, it } from "@jest/globals";

import {
  emptyChapter,
  emptyFunderForm,
  fieldProvenance,
  fillEmptyFromDraft,
  formFromDraft,
  formToCreateRequest,
  funderApiErrorKey,
  funderImportErrorKey,
  groupProvenance,
  originalDisplay,
  parseAward,
  validateFunderForm,
  evidenceFor,
} from "@/components/ConceptNoteWorkspace/funder-import-form";
import type { ConceptNoteFunderImportDraft } from "@/util/types";

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
    max_award: "600000.00",
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
        required_fields: ["municipality_name"],
      },
    ],
  },
  evidence: [
    { field: "funder.name", quote: "Green Cities Foundation", page: 1 },
    {
      field: "opportunity.min_award",
      quote: "USD 150,000 to 600,000",
      page: 12,
    },
    {
      field: "opportunity.max_award",
      quote: "USD 150,000 to 600,000",
      page: 12,
    },
    {
      field: "template.chapter_schema.applicant_details",
      quote: "Section 1: Applicant details",
      page: null,
    },
  ],
  missing: [
    "funder.region",
    "opportunity.category",
    "opportunity.finance_route",
  ],
};

describe("funder import provenance", () => {
  it("marks unchanged extracted values as from the document", () => {
    expect(
      fieldProvenance(draft, "funder.name", "Green Cities Foundation"),
    ).toBe("document");
    // Whitespace and decimal formatting do not count as edits.
    expect(
      fieldProvenance(draft, "funder.name", "  Green Cities Foundation "),
    ).toBe("document");
    expect(fieldProvenance(draft, "opportunity.min_award", "150000")).toBe(
      "document",
    );
    expect(
      fieldProvenance(draft, "opportunity.hazards", ["Flooding", "Heat"]),
    ).toBe("document");
  });

  it("marks changed or cleared extracted values as edited", () => {
    expect(fieldProvenance(draft, "funder.name", "Green Cities Fund")).toBe(
      "edited",
    );
    expect(fieldProvenance(draft, "funder.country", "")).toBe("edited");
    expect(fieldProvenance(draft, "opportunity.hazards", ["Heat"])).toBe(
      "edited",
    );
  });

  it("reports fields missing from the document until the user fills them", () => {
    expect(fieldProvenance(draft, "funder.region", "")).toBe("missing");
    expect(fieldProvenance(draft, "funder.region", "Americas")).toBe("entered");
    expect(fieldProvenance(draft, "opportunity.interventions", [])).toBeNull();
  });

  it("treats every typed value as entered when there is no import", () => {
    expect(fieldProvenance(null, "funder.name", "Resilient Futures")).toBe(
      "entered",
    );
    expect(fieldProvenance(null, "funder.name", " ")).toBeNull();
  });

  it("tracks profile facts and chapters by key and reference", () => {
    expect(
      fieldProvenance(
        draft,
        "funder.profile.stated.purpose",
        "Helps cities reduce climate risk.",
      ),
    ).toBe("document");
    expect(
      fieldProvenance(draft, "funder.profile.stated.purpose", "Other purpose"),
    ).toBe("edited");
    expect(
      fieldProvenance(draft, "funder.profile.stated.focus", "Coastal cities"),
    ).toBe("entered");
    const [chapter] = formFromDraft(draft).template.chapters;
    const path = `template.chapter_schema.${chapter!.chapter_ref}`;
    expect(fieldProvenance(draft, path, chapter)).toBe("document");
    expect(fieldProvenance(draft, path, { ...chapter!, required: false })).toBe(
      "edited",
    );
    expect(
      fieldProvenance(draft, "template.chapter_schema.", {
        ...emptyChapter(),
        title: "Budget",
      }),
    ).toBe("entered");
    expect(
      fieldProvenance(draft, "template.chapter_schema.", emptyChapter()),
    ).toBeNull();
  });

  it("combines the award range into one state", () => {
    const award = (min: string, max: string, currency: string) =>
      groupProvenance(draft, [
        ["opportunity.min_award", min],
        ["opportunity.max_award", max],
        ["opportunity.currency", currency],
      ]);
    expect(award("150000", "600000", "USD")).toBe("document");
    expect(award("150000", "700000", "USD")).toBe("edited");
    expect(groupProvenance(null, [["opportunity.min_award", "5"]])).toBe(
      "entered",
    );
    expect(
      evidenceFor(draft, ["opportunity.min_award", "opportunity.max_award"]),
    ).toHaveLength(1);
  });

  it("shows the original draft value for edited fields", () => {
    expect(originalDisplay(draft, "opportunity.max_award")).toBe("600000");
    expect(originalDisplay(draft, "opportunity.hazards")).toBe(
      "Flooding, Heat",
    );
    expect(
      originalDisplay(draft, "template.chapter_schema.applicant_details"),
    ).toBe("Applicant details");
    expect(originalDisplay(null, "funder.name")).toBe("");
  });
});

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
    expect(validateFunderForm(noChapters)["template.chapter_schema"]).toBe(
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

  it("fills only empty fields when a document arrives after typing", () => {
    const typed = emptyFunderForm();
    typed.funder.name = "Typed Fund";
    typed.opportunity.hazards = ["Drought"];
    typed.template.chapters[0]!.title = "My chapter";
    const merged = fillEmptyFromDraft(typed, draft);
    expect(merged.funder.name).toBe("Typed Fund");
    expect(merged.funder.country).toBe("United States");
    expect(merged.opportunity.hazards).toEqual(["Drought"]);
    expect(merged.opportunity.name).toBe("Nature-Based Cities Call 2026");
    expect(merged.template.chapters.map((chapter) => chapter.title)).toEqual([
      "My chapter",
    ]);
    expect(merged.funder.stated.map((row) => row.key)).toEqual(["purpose"]);
  });

  it("builds the create request with numbers and nulls", () => {
    const form = formFromDraft(draft);
    form.funder.stated.push({ id: "blank", key: " ", value: "ignored" });
    form.opportunity.currency = " ";
    const request = formToCreateRequest(form, "import-1");
    expect(request.import_id).toBe("import-1");
    expect(request.opportunity.min_award).toBe(150000);
    expect(request.opportunity.max_award).toBe(600000);
    expect(request.opportunity.currency).toBeNull();
    expect(request.opportunity.category).toBeNull();
    expect(request.funder.profile.stated).toEqual({
      purpose: "Helps cities reduce climate risk.",
    });
    expect(request.template.chapter_schema[0]).toEqual({
      chapter_ref: "applicant_details",
      title: "Applicant details",
      description: "Municipality and legal representative.",
      required: true,
      required_fields: ["municipality_name"],
    });
    expect(formToCreateRequest(emptyFunderForm(), null).import_id).toBeNull();
  });
});

describe("funder import errors", () => {
  it("maps failed import codes to copy, treating unknown codes as generic", () => {
    expect(funderImportErrorKey("document_too_long")).toBe(
      "funder-import-error-too-long",
    );
    expect(funderImportErrorKey("extraction_interrupted")).toBe(
      "funder-import-error-interrupted",
    );
    expect(funderImportErrorKey("source_fetch_failed")).toBe(
      "funder-import-error-source",
    );
    expect(funderImportErrorKey("source_hash_mismatch")).toBe(
      "funder-import-error-generic",
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
    expect(funderApiErrorKey(problem("upload_not_found", 404))).toBe(
      "funder-error-upload-not-found",
    );
    expect(funderApiErrorKey({ status: 422, data: { detail: "bad" } })).toBe(
      "funder-error-invalid",
    );
    expect(funderApiErrorKey({ status: 500, data: null })).toBe(
      "funder-error-generic",
    );
  });
});
