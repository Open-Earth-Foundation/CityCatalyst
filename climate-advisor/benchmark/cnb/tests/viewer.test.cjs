/**
 * Exercise the static viewer's chapter-pair rendering and legacy snapshots.
 * Reads ../viewer/app.js in a browser stub; no network, files written, or providers.
 * From repository root: node --test climate-advisor/benchmark/cnb/tests/viewer.test.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../viewer/app.js"), "utf8");
const context = vm.createContext({
  URLSearchParams,
  location: { search: "", hash: "" },
  window: { addEventListener() {} },
  document: {
    getElementById: () => ({ addEventListener() {} }),
    addEventListener() {},
    documentElement: { dataset: {} },
  },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
});
// Expose existing functions inside the test only, keeping browser assets standalone.
vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.viewer = { extractionFacts, extractionGate, factStats, stageDocCard,
    goldenTab, extractionTab, verdictDiff, usageTotals, runTotals, indexTotals, usageDiff, costText,
    setRun: (run) => { D = run; } };
})();`), context);
const viewer = context.viewer;

function fixture({ legacy = false, verdict = "covered" } = {}) {
  const fact = {
    id: "programme-cost",
    statement: "Programme cost is USD 26.5 million.",
    evidence: [{ text: "USD 26.5 million", locators: [{ page: 1 }] }],
    ...(legacy ? { required: true } : { requirements: [
      { chapter_ref: "summary", priority: "mandatory" },
      { chapter_ref: "financing", priority: "mandatory" },
      { chapter_ref: "schedule", priority: "desirable" },
    ] }),
  };
  const facts = legacy
    ? [{ id: fact.id, verdict }]
    : fact.requirements.map((r) => ({ id: `${fact.id}::${r.chapter_ref}`, verdict }));
  const judgment = { facts: facts.map((f) => ({ ...f, reason: "Test verdict", output_refs: [] })),
    topics: [], claims: [], contradictions: [] };
  return {
    golden: {
      fixture_id: "test-city", source: { language: "en", source_format: "pdf" },
      extraction: { facts: [fact], topics: [], thresholds: legacy
        ? { min_required_fact_coverage: 0.75, min_topic_coverage: 0.6 }
        : { min_topic_coverage: 0.6 } },
    },
    drafting_input: { chapter_schema: [
      { chapter_ref: "summary", title: "Project summary" },
      { chapter_ref: "financing", title: "Financing" },
      { chapter_ref: "schedule", title: "Schedule" },
    ] },
    units: [{ anchor: "page-1", text: "USD 26.5 million" }],
    stages: { extraction: { judgment, report: { judgment, metrics: {}, evaluation_errors: [],
      integrity_failures: [], semantic_failures: [] } } },
  };
}

test("current facts count mandatory receiving-chapter pairs and use a 100% gate", () => {
  const f = fixture();
  const judgment = f.stages.extraction.judgment;
  judgment.facts[1].verdict = "missing";
  const stats = viewer.factStats(f, "extraction", judgment);
  assert.equal(viewer.extractionFacts(f).length, 3);
  assert.equal(stats.required, 2);
  assert.equal(stats.coverage, 0.5);
  assert.equal(viewer.extractionGate(f), 1);
  judgment.facts[1].verdict = "covered";
  const card = viewer.stageDocCard(f, "extraction");
  assert.match(card, /Meets gate/);
  assert.doesNotMatch(card, /NaN|Below gate|undefined/);
});

test("extraction investigation and golden expectations show chapter-specific labels and anchors", () => {
  const f = fixture();
  viewer.setRun({ run: { id: "candidate" }, fixtures: [f] });
  const detail = viewer.extractionTab(f);
  assert.match(detail, /id="programme-cost::financing"/);
  assert.match(detail, /Programme cost is USD 26.5 million/);
  assert.match(detail, /programme-cost::financing · Financing/);
  const golden = viewer.goldenTab(f);
  assert.match(golden, /Financing: mandatory/);
  assert.match(golden, /Schedule: desirable/);
  assert.doesNotMatch(golden, />optional</);
});

test("changed pair verdict links identify the expectation and receiving chapter", () => {
  const before = fixture();
  const after = fixture();
  after.stages.extraction.judgment.facts[1].verdict = "missing";
  const html = viewer.verdictDiff({ run: { id: "baseline" }, fixtures: [before] },
    { run: { id: "candidate" }, fixtures: [after] });
  assert.match(html, /Programme cost is USD 26.5 million\. · Financing/);
  assert.match(html, /\?run=candidate#\/f\/test-city\/extraction\/programme-cost%3A%3Afinancing/);
  assert.match(html, /1 changed verdict/);
});

test("unavailable judgments stay visible without inventing unconfigured stage failures", () => {
  const before = fixture();
  const after = fixture();
  after.stages.extraction = { report: { evaluation_errors: ["Judge unavailable"] } };
  const html = viewer.verdictDiff({ run: { id: "baseline" }, fixtures: [before] },
    { run: { id: "candidate" }, fixtures: [after] });
  assert.equal((html.match(/Unavailable judgment/g) || []).length, 1);
  assert.match(html, /\?run=candidate#\/f\/test-city\/extraction/);
});

test("historical document-level snapshots keep their original IDs and threshold", () => {
  const f = fixture({ legacy: true });
  const stats = viewer.factStats(f, "extraction", f.stages.extraction.judgment);
  assert.equal(stats.required, 1);
  assert.equal(stats.coverage, 1);
  assert.equal(viewer.extractionFacts(f)[0].id, "programme-cost");
  assert.equal(viewer.extractionGate(f), 0.75);
  assert.match(viewer.goldenTab(f), />required</);
  assert.match(viewer.stageDocCard(f, "extraction"), /gate 75%/);
});

test("changed editing verdicts link to the corresponding saved case", () => {
  const before = fixture();
  const after = fixture();
  for (const f of [before, after]) {
    f.golden.editing = { cases: [{ id: "rename", instruction: "Rename the programme" }] };
    f.stages.editing = { report: { judgment: {}, details: { cases: [{ case_id: "rename", outcome_ok: true }] } } };
  }
  after.stages.editing.report.semantic_failures = ["rename: protected fact removed"];
  const html = viewer.verdictDiff({ run: { id: "baseline" }, fixtures: [before] },
    { run: { id: "candidate" }, fixtures: [after] });
  assert.match(html, /\?run=candidate#\/f\/test-city\/editing\/case-rename/);
});

test("partial and legacy prices are visible and cannot imply cost savings", () => {
  const before = fixture(), after = fixture();
  before.usage = { extraction: { cost_usd: 10, cost_complete: true, seconds: 2, requests: 1 } };
  after.usage = { extraction: { cost_usd: 0, cost_complete: false, unpriced_requests: 1, seconds: 2, requests: 1 } };
  const a = { run: {}, fixtures: [before] }, b = { run: {}, fixtures: [after] };
  const partial = viewer.usageDiff(a, b);
  assert.match(partial, /\$0\.00 \(partial: 1 unpriced requests\)/);
  assert.match(partial, /Cost comparison unavailable/);
  assert.doesNotMatch(partial, /-100%/);
  assert.equal(viewer.runTotals(b).cost_complete, false);
  const indexed = viewer.indexTotals({ fixtures: { "test-city": { usage: after.usage } } });
  assert.match(viewer.costText(indexed), /partial: 1 unpriced requests/);
  delete after.usage.extraction.cost_complete;
  assert.match(viewer.usageDiff(a, b), /completeness not recorded/);
  after.usage.extraction = { cost_usd: 5, cost_complete: true, seconds: 2, requests: 1 };
  assert.match(viewer.usageDiff(a, b), /-50%/);
});

test("PDF-only runs show conversion time and unknown cost without a complete zero total", () => {
  const f = fixture();
  f.input_provenance = { conversion: { elapsed_seconds: 6, cost: { status: "unavailable", usd: null } } };
  const run = { run: {}, fixtures: [f] };
  const totals = viewer.runTotals(run);
  assert.equal(totals.conversion_seconds, 6);
  assert.equal(totals.cost_complete, false);
  assert.match(viewer.costText(totals), /\$0\.00 \(partial\)/);
  const html = viewer.usageDiff({ run: {}, fixtures: [] }, run);
  assert.match(html, /PDF conversion/);
  assert.match(html, /6 s/);
  assert.match(html, /Cost unavailable · excluded from total/);
  assert.match(html, /Cost comparison unavailable/);
});
