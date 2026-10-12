import { describe, expect, it } from "@jest/globals";

import {
  emptyFunderForm,
  formToCreateRequest,
  parseAward,
  validateFunderForm,
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
    const form = typedForm();
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
});
