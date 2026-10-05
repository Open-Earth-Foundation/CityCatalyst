import { describe, expect, it } from "@jest/globals";

import {
  emptyFunderForm,
  formToCreateRequest,
  funderApiErrorKey,
  parseAward,
  textValue,
  validateFunderForm,
  withTextValue,
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
  form.template.chapters[0]!.title = "Applicant details";
  form.template.chapters[0]!.required_fields =
    "municipality_name, contact_email";
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
    expect(withAward("150,000", "600 000")).toEqual({});
    expect(parseAward("")).toBeNull();
    expect(parseAward("1.234")).toBeUndefined();
  });

  it("reads and replaces one text input without touching the original", () => {
    const form = typedForm();
    const edited = withTextValue(form, "template", "output_format", "DOCX");
    expect(textValue(edited, "template", "output_format")).toBe("DOCX");
    expect(textValue(form, "template", "output_format")).toBe("");
    expect(edited.template.chapters).toBe(form.template.chapters);
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
