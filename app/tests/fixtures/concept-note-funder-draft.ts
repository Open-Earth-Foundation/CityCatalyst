import type { ConceptNoteFunderImportDraft } from "@/util/types";

export const funderDraft: ConceptNoteFunderImportDraft = {
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
    min_award: 150000,
    max_award: 600000.5,
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
