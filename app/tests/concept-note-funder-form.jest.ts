import { describe, expect, it } from "@jest/globals";

import {
  emptyFunderForm,
  emptyTemplateForm,
  formFromDraft,
  formToCreateRequest,
  funderApiErrorKey,
  ownTemplateRequest,
  parseAward,
  templateFieldsFromContext,
  templateFormFrom,
  validateFunderForm,
  validateTemplateForm,
} from "@/components/ConceptNoteWorkspace/funder-form";
import type { ConceptNoteFunderImport } from "@/util/types";
import { funderDraft as draft } from "./fixtures/concept-note-funder-draft";

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
        `chapter.${form.chapters[0]!.id}.title`,
      ].sort(),
    );
    expect(
      validateFunderForm({ ...form, chapters: [] })["template.chapters"],
    ).toBe("funder-error-chapters");
    expect(validateFunderForm(formFromDraft(draft))).toEqual({});
  });

  it("accepts empty and localized awards", () => {
    const form = formFromDraft(draft);
    form.opportunity.min_award = "150 000,50";
    form.opportunity.max_award = "600 000.50";
    expect(validateFunderForm(form)).toEqual({});
    expect(parseAward("")).toBeNull();
  });

  it.each(["150 000,50", "150\u00a0000,50", "150\u202f000.50", "150000.50"])(
    "submits the exact award amount for %s",
    (amount) => {
      const form = formFromDraft(draft);
      form.opportunity.min_award = amount;
      expect(validateFunderForm(form)).toEqual({});
      expect(formToCreateRequest(form, null).opportunity.min_award).toBe(
        150000.5,
      );
    },
  );

  it.each([
    ...[
      "abc",
      "-5",
      "150,000",
      "150,000.50",
      "150.000,50",
      "1 2",
      "1,234",
      "1.234",
      "9".repeat(400),
      "9999999999999999.99",
    ].map(
      (amount) =>
        ["opportunity", "min_award", amount, "funder-error-award"] as const,
    ),
    ["opportunity", "max_award", "100", "funder-error-award-range"],
    [
      "opportunity",
      "max_award",
      "10000000000000000",
      "funder-error-award-limit",
    ],
    ["chapters", "description", "x".repeat(4001), "funder-error-length-4000"],
    ["chapters", "title", "Summary\nBudget", "funder-error-chapter-title-line"],
    ["root", "chapters", 101, "funder-error-chapter-limit"],
    ["funder", "name", "x".repeat(256), "funder-error-length-255"],
  ] as const)("rejects invalid %s.%s", (section, field, value, error) => {
    const form = formFromDraft(draft);
    if (section === "root") {
      form.chapters = Array.from({ length: value as number }, () => ({
        ...form.chapters[0]!,
      }));
    } else {
      Object.assign(
        section === "chapters" ? form.chapters[0]! : form[section],
        { [field]: value },
      );
    }
    const key =
      section === "root"
        ? "template.chapters"
        : section === "chapters"
          ? `chapter.${form.chapters[0]!.id}.${field}`
          : `${section}.${field}`;
    expect(validateFunderForm(form)[key]).toBe(error);
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
  it("maps API statuses to copy", () => {
    expect(funderApiErrorKey({ status: 422, data: { detail: "bad" } })).toBe(
      "funder-error-invalid",
    );
    expect(funderApiErrorKey({ status: 403, data: null })).toBe(
      "funding-permission-error",
    );
    expect(funderApiErrorKey({ status: 500, data: null })).toBe(
      "funder-error-generic",
    );
  });
});

describe("own template", () => {
  it("needs only a template name and titled chapters", () => {
    const form = emptyTemplateForm();
    expect(validateTemplateForm(form)).toEqual({
      "template.template_name": "funder-error-template-name",
      [`chapter.${form.chapters[0]!.id}.title`]: "funder-error-chapter-title",
    });
    expect(
      validateTemplateForm({ ...form, chapters: [] })["template.chapters"],
    ).toBe("funder-error-chapters");
  });

  it("edits a saved template with its chapter details", () => {
    const fields = templateFieldsFromContext({
      id: "own",
      name: "City concept note",
      output_format: null,
      chapter_schema: [
        {
          chapter_ref: "summary",
          title: "Summary",
          required_fields: ["total_budget"],
        },
      ],
      required_fields: ["total_budget"],
    });
    expect(fields.chapter_schema).toEqual([
      {
        chapter_ref: "summary",
        title: "Summary",
        description: null,
        required: false,
        required_fields: ["total_budget"],
      },
    ]);
    // A saved template survives a round trip through the form.
    expect(ownTemplateRequest(templateFormFrom(fields), null).template).toEqual(
      fields,
    );
  });
});
