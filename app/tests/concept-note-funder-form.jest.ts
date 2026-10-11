import { describe, expect, it } from "@jest/globals";

import {
  emptyFunderForm,
  formToCreateRequest,
  funderApiErrorKey,
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

  it("validates award amounts and their order", () => {
    const form = typedForm();
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
    expect(withAward("150 000,50", "600 000.50")).toEqual({});
    expect(parseAward("")).toBeNull();
    expect(parseAward("1.234")).toBeNaN();
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
    "150,000",
    "150,000.50",
    "150.000,50",
    "1 2",
    "1,234",
    "9".repeat(400),
  ])("rejects an ambiguous or invalid award %s", (amount) => {
    const form = typedForm();
    form.opportunity.min_award = amount;
    expect(validateFunderForm(form)["opportunity.min_award"]).toBe(
      "funder-error-award",
    );
  });

  it("builds the create request with numbers, lists and nulls", () => {
    const form = typedForm();
    form.opportunity.currency = " ";
    form.opportunity.hazards = "Flooding, , Heat, Flooding";
    const request = formToCreateRequest(form);
    expect(request.funder.profile).toEqual({ stated: {}, derived: {} });
    expect(request.opportunity).toMatchObject({
      min_award: 150000,
      max_award: 600000.5,
      currency: null,
      category: null,
      hazards: ["Flooding", "Heat"],
      known_gaps: [],
    });
    expect(request.template.chapter_schema[0]).toEqual({
      chapter_ref: "",
      title: "Applicant details",
      description: null,
      required: true,
      required_fields: ["municipality_name", "contact_email"],
    });
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

describe("shared request limits", () => {
  it.each([
    ["funder", "name", 255],
    ["funder", "country", 100],
    ["opportunity", "currency", 16],
    ["opportunity", "status", 64],
    ["template", "template_name", 255],
  ] as const)(
    "shows the API length limit for %s.%s",
    (section, field, limit) => {
      const form = typedForm();
      Object.assign(form[section], { [field]: "x".repeat(limit + 1) });
      expect(validateFunderForm(form)[`${section}.${field}`]).toBe(
        `funder-error-length-${limit}`,
      );
    },
  );
  it("validates chapter text and count against workspace limits", () => {
    const form = typedForm();
    form.chapters[0]!.description = "x".repeat(4001);
    form.chapters[0]!.title = "Summary\nBudget";
    const errors = validateFunderForm(form);
    expect(errors[`chapter.${form.chapters[0]!.id}.description`]).toBe(
      "funder-error-length-4000",
    );
    expect(errors[`chapter.${form.chapters[0]!.id}.title`]).toBe(
      "funder-error-chapter-title-line",
    );
    form.chapters = Array.from({ length: 101 }, () => ({
      ...form.chapters[0]!,
      title: "Summary",
      description: "",
    }));
    expect(validateFunderForm(form)["template.chapters"]).toBe(
      "funder-error-chapter-limit",
    );
  });
  it("rejects awards exceeding storage limits or losing numeric precision", () => {
    const form = typedForm();
    form.opportunity.max_award = "10000000000000000";
    expect(validateFunderForm(form)["opportunity.max_award"]).toBe(
      "funder-error-award-limit",
    );
    expect(parseAward("9999999999999999.99")).toBeNaN();
  });
});
