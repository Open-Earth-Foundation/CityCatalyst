"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  itemsWithoutRelatedPath,
  pathsRelated,
} = require("./review.js");

test("collection and wildcard paths map to array fields", () => {
  const fieldPath = "opportunity.criteria[eligibility-1].weight";

  assert.equal(pathsRelated(fieldPath, "opportunity.criteria"), true);
  assert.equal(
    pathsRelated(fieldPath, "opportunity.criteria[*].weight"),
    true,
  );
  assert.equal(pathsRelated(fieldPath, "opportunity.pipeline_entries"), false);
});

test("items without an editable field remain visible as unmatched", () => {
  const decisionPaths = ["opportunity.criteria[eligibility-1].weight"];
  const gaps = [
    { target_path: "opportunity.criteria[*].weight" },
    { target_path: "opportunity.pipeline_entries" },
    { target_path: "source_assessments[*].license_status" },
  ];

  assert.deepEqual(itemsWithoutRelatedPath(gaps, decisionPaths), [
    gaps[1],
    gaps[2],
  ]);
});
