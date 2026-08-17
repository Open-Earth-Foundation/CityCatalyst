"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REFERENCE_DATA_MODE,
  buildReviewUpdate,
} = require("./review-support.js");

const FUNDER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_REF = "project-001";
const SELECTION_PATH = `funded_projects[${PROJECT_REF}].selected_funder_id`;
const bundle = {
  run_id: "run-001",
  schema_version: "3.0",
  funder: { funder_ref: "funder-001", name: "Example Funder" },
  funding_opportunities: [
    {
      funding_opportunity_ref: "opportunity-001",
      name: "Example Program",
    },
  ],
  funded_projects: [
    {
      funded_project_ref: PROJECT_REF,
      name: "Evidence-backed project",
      candidate_funders: [{ funder_id: FUNDER_ID }],
    },
  ],
};

function buildUpdate(status, decisions = new Map()) {
  return buildReviewUpdate({
    bundle,
    mode: REFERENCE_DATA_MODE,
    decisions,
    review: { status },
    savedAt: "2026-01-01T00:00:00Z",
  });
}

test("non-approved reviews save without a canonical funder selection", () => {
  ["pending_review", "needs_changes", "rejected"].forEach((status) => {
    assert.equal(buildUpdate(status).review.status, status);
  });
});

test("approved reviews still require a canonical funder selection", () => {
  assert.throws(
    () => buildUpdate("approved"),
    /Select one canonical funder for "Evidence-backed project"\./,
  );
});

test("approved reviews save with a proposed canonical funder selection", () => {
  const decisions = new Map([
    [
      SELECTION_PATH,
      {
        target_path: SELECTION_PATH,
        segments: ["funded_projects", 0, "selected_funder_id"],
        selected: true,
        original_value: null,
        reviewed_value: FUNDER_ID,
      },
    ],
  ]);

  assert.equal(buildUpdate("approved", decisions).review.status, "approved");
});
