import {
  emptyFunderForm,
  formToCreateRequest,
  type FunderForm,
} from "@/components/ConceptNoteWorkspace/funder-form";

/** A complete form as a user would type it; each test gets fresh rows. */
export function typedFunderForm(): FunderForm {
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

export const funderRequest = formToCreateRequest(typedFunderForm(), null);
