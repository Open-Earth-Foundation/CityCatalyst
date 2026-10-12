import { describe, expect, it } from "@jest/globals";

import {
  emptyFunderForm,
  formToCreateRequest,
  parseAward,
  validateFunderForm,
  type FunderForm,
} from "@/components/ConceptNoteWorkspace/funder-form";

/** A complete form as a user would type it. */
function typedForm(): FunderForm {
  const form = emptyFunderForm();
  form.funder.name = "Green Cities Foundation";
  form.opportunity.name = "Nature-Based Cities Call 2026";
  form.opportunity.min_award = "150000";
  form.opportunity.max_award = "600000.5";
  form.template.template_name = "Proposal form";
  form.chapters[0]!.title = "Applicant details";
  form.chapters[0]!.required_fields = "municipality_name, contact_email";
  return form;
}

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
    expect(validateFunderForm(typedForm())).toEqual({});
  });

  it("accepts empty and localized awards", () => {
    const form = typedForm();
    form.opportunity.min_award = "150 000,50";
    form.opportunity.max_award = "600 000.50";
    expect(validateFunderForm(form)).toEqual({});
    expect(parseAward("")).toBeNull();
  });

  it.each(["150 000,50", "150\u00a0000,50", "150\u202f000.50", "150000.50"])(
    "submits the exact award amount for %s",
    (amount) => {
      const form = typedForm();
      form.opportunity.min_award = amount;
      expect(validateFunderForm(form)).toEqual({});
      expect(formToCreateRequest(form).opportunity.min_award).toBe(150000.5);
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
    ].map((amount) => ({
      name: `invalid award ${amount}`,
      change: (form: FunderForm) => {
        form.opportunity.min_award = amount;
      },
      field: "opportunity.min_award",
      error: "funder-error-award",
    })),
    {
      name: "reversed awards",
      change: (form: FunderForm) => {
        form.opportunity.min_award = "700";
        form.opportunity.max_award = "600";
      },
      field: "opportunity.max_award",
      error: "funder-error-award-range",
    },
    {
      name: "award above storage limit",
      change: (form: FunderForm) => {
        form.opportunity.max_award = "10000000000000000";
      },
      field: "opportunity.max_award",
      error: "funder-error-award-limit",
    },
    {
      name: "long chapter description",
      change: (form: FunderForm) => {
        form.chapters[0]!.description = "x".repeat(4001);
      },
      field: "chapter",
      chapterField: "description",
      error: "funder-error-length-4000",
    },
    {
      name: "multiline chapter title",
      change: (form: FunderForm) => {
        form.chapters[0]!.title = "Summary\nBudget";
      },
      field: "chapter",
      chapterField: "title",
      error: "funder-error-chapter-title-line",
    },
    {
      name: "too many chapters",
      change: (form: FunderForm) => {
        form.chapters = Array.from({ length: 101 }, () => ({
          ...form.chapters[0]!,
        }));
      },
      field: "template.chapters",
      error: "funder-error-chapter-limit",
    },
    {
      name: "long funder name",
      change: (form: FunderForm) => {
        form.funder.name = "x".repeat(256);
      },
      field: "funder.name",
      error: "funder-error-length-255",
    },
  ])("rejects $name", ({ change, field, error, ...testCase }) => {
    const form = typedForm();
    change(form);
    const key =
      field === "chapter"
        ? `chapter.${form.chapters[0]!.id}.${testCase.chapterField}`
        : field;
    expect(validateFunderForm(form)[key]).toBe(error);
  });
});
