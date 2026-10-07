import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";

export function draftFixture(): DraftStatusResponse {
  return {
    draft_run_id: "draft-1",
    thread_id: "thread-1",
    status: "ready",
    workflow_step: "draft",
    source_candidates: [
      {
        candidate_id: "candidate-1",
        datasource_id: "source-1",
        name: "SEEG",
        dataset_name: "Grid dataset",
        dataset_year: 2023,
        geography_match: "city",
        applicability_status: "applicable",
        source_scope: {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          scope_id: "1",
        },
        normalized_rows: [
          { emissions_value: "0.41", emissions_unit: "MtCO2e" },
        ],
      },
      {
        candidate_id: "candidate-2",
        datasource_id: "source-2",
        name: "ClimateTRACE",
        dataset_name: "Scope comparison dataset",
        dataset_year: 2023,
        geography_match: "city",
        applicability_status: "applicable",
        source_scope: {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          scope_id: "1",
        },
        normalized_rows: [
          { emissions_value: "0.52", emissions_unit: "MtCO2e" },
        ],
      },
      {
        candidate_id: "candidate-3",
        datasource_id: "source-3",
        name: "Vulcan",
        dataset_name: "Building benchmark dataset",
        dataset_year: 2023,
        geography_match: "city",
        applicability_status: "applicable",
        source_scope: {
          sector_reference_number: "I",
          subsector_reference_number: "I.2",
          scope_id: "1",
        },
        normalized_rows: [
          { emissions_value: "0.31", emissions_unit: "MtCO2e" },
        ],
      },
    ],
    proposals: [
      {
        proposal_id: "proposal-ready",
        target_ref: {
          sector_reference_number: "I",
          subsector_reference_number: "I.2",
          subsector_name: "Commercial & institutional",
          scope_id: "1",
        },
        current_value: null,
        recommended_candidate_id: "candidate-3",
        recommended_datasource_id: "source-3",
        alternative_candidate_ids: [],
        proposed_value: { value: "0.31", unit: "MtCO2e" },
        rationale: "Single compatible source.",
        status: "ready",
      },
      {
        proposal_id: "proposal-conflict",
        target_ref: {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          subsector_name: "Residential buildings",
          scope_id: "1",
        },
        current_value: null,
        recommended_candidate_id: "candidate-1",
        recommended_datasource_id: "source-1",
        alternative_candidate_ids: ["candidate-2"],
        proposed_value: { value: "0.41", unit: "MtCO2e" },
        rationale: "Two sources disagree.",
        status: "conflict",
      },
      {
        proposal_id: "proposal-gap",
        target_ref: {
          sector_reference_number: "I",
          subsector_reference_number: "I.8",
          subsector_name: "Fugitive oil and natural gas",
          scope_id: "1",
        },
        current_value: null,
        recommended_candidate_id: null,
        recommended_datasource_id: null,
        alternative_candidate_ids: [],
        proposed_value: null,
        rationale: "No matching source.",
        status: "gap",
      },
    ],
    review_decisions: [],
  };
}
