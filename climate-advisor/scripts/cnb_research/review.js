(function () {
  "use strict";

  const REFERENCE_DATA_MODE = "reference_data";
  const SIMILAR_PROJECT_MODE = "similar_projects";
  const REFERENCE_DATA_UPDATE_TYPE = "cnb_reference_data_review";
  const SIMILAR_PROJECT_UPDATE_TYPE = "cnb_similar_project_review";

  const IDENTITY_KEYS = [
    "funding_record_ref", "criterion_ref", "template_ref", "chapter_ref",
    "funder_ref",
  ];
  const COLLECTION_IDENTITY_KEYS = {
    funding_records: "funding_record_ref",
    funder_criteria: "criterion_ref",
    funder_templates: "template_ref",
    chapter_schema: "chapter_ref",
  };
  const REVIEW_ONLY_RECORD_KEYS = new Set([
    "candidate_funders", "project_tags", "selected_funder_id",
  ]);
  const NUMBER_KEYS = new Set([
    "weight", "min_award", "max_award", "award_amount", "award_year",
  ]);
  const MONEY_KEYS = new Set([
    "min_award", "max_award", "award_amount",
  ]);
  const BOOLEAN_KEYS = new Set(["hard_gate", "required", "is_opportunity"]);
  const REFERENCE_DATA_SECTIONS = [
    ["funder", "Funder", "Institutional identity, scope, and profile.", ["funder"]],
    ["records", "Funding records", "The opportunity and complete funded-project examples.", [
      "funding_records",
    ]],
    ["template", "Application template", "Form structure and required content.", [
      "funder_templates",
    ]],
    ["criteria", "Criteria", "Eligibility and evaluation requirements.", [
      "funder_criteria",
    ]],
  ];
  const SIMILAR_PROJECT_SECTIONS = [
    [
      "current-project",
      "Current project",
      "Ingested project fields supplied to the internal similar-project search.",
    ],
    [
      "selected-matches",
      "Selected matches",
      "Reviewed match decisions joined to candidate display context and evidence.",
    ],
    [
      "result-caveats",
      "Result caveats",
      "Run-level caveats retained with the reviewed similar-project result.",
    ],
  ];

  const state = { bundle: null, mode: REFERENCE_DATA_MODE, decisions: new Map() };
  const view = {};
  let statusTimer;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initialize);
  }

  function initialize() {
    [
      "bundleInput", "saveButton", "pageTitle", "emptyState", "emptyStateLabel",
      "emptyStateTitle", "emptyStateDescription", "loadError", "workspace",
      "workspaceLabel", "programName", "runMeta", "sourceCount", "evidenceCount",
      "gapCount", "conflictCount", "countLabel1", "countLabel2", "countLabel3",
      "countLabel4", "sectionNav", "reviewLayout", "selectionSummary",
      "editorSections", "inspectorPanel", "inspectorTitle", "inspectorPath",
      "inspectorContent", "reviewMetaLabel", "reviewStatus", "reviewerName",
      "reviewNotes", "saveHelpText", "closeInspector", "statusMessage",
    ].forEach((id) => { view[id] = document.getElementById(id); });

    view.bundleInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) loadBundle(file);
      event.target.value = "";
    });
    view.saveButton.addEventListener("click", saveUpdate);
    view.closeInspector.addEventListener("click", () => showInspector());
  }

  async function loadBundle(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const mode = detectReviewMode(parsed);
      const bundle = normalizeBundle(parsed, mode);
      validateBundle(bundle, mode);
      state.bundle = bundle;
      state.mode = mode;
      state.decisions.clear();
      renderWorkspace();
      view.loadError.textContent = "";
      showStatus(`Loaded ${file.name}`);
    } catch (error) {
      view.loadError.textContent = `Could not load research JSON: ${error.message}`;
    }
  }

  function detectReviewMode(bundle) {
    if (!bundle || typeof bundle !== "object") {
      return REFERENCE_DATA_MODE;
    }
    if (
      bundle.artifact_type === "cnb_similar_project_search"
      || bundle.review_mode === SIMILAR_PROJECT_MODE
    ) {
      return SIMILAR_PROJECT_MODE;
    }
    if (
      bundle.search_request
      && Array.isArray(bundle.candidates)
      && bundle.result
      && typeof bundle.result === "object"
    ) {
      return SIMILAR_PROJECT_MODE;
    }
    return REFERENCE_DATA_MODE;
  }

  function normalizeBundle(bundle, mode) {
    const normalized = clone(bundle);
    if (mode === SIMILAR_PROJECT_MODE) {
      normalizeSimilarProjectBundle(normalized);
    } else {
      normalizeReferenceDataBundle(normalized);
    }
    return normalized;
  }

  function normalizeReferenceDataBundle(bundle) {
    if (!Array.isArray(bundle.funding_records)) bundle.funding_records = [];
    if (!Array.isArray(bundle.sources)) bundle.sources = [];
    if (!Array.isArray(bundle.evidence)) bundle.evidence = [];
    if (!Array.isArray(bundle.gaps)) bundle.gaps = [];
    if (!Array.isArray(bundle.conflicts)) bundle.conflicts = [];
    if (!Array.isArray(bundle.funder_templates)) bundle.funder_templates = [];
    if (!Array.isArray(bundle.funder_criteria)) bundle.funder_criteria = [];
    if (!bundle.review || typeof bundle.review !== "object") {
      bundle.review = pendingReview();
    }

    bundle.funding_records = bundle.funding_records.map((record) => {
      const nextRecord = { ...record };
      if (!Array.isArray(nextRecord.project_tags)) nextRecord.project_tags = [];
      if (!Array.isArray(nextRecord.candidate_funders)) {
        nextRecord.candidate_funders = [];
      }
      if (!Object.prototype.hasOwnProperty.call(nextRecord, "selected_funder_id")) {
        nextRecord.selected_funder_id = null;
      }
      if (!Object.prototype.hasOwnProperty.call(nextRecord, "reported_funder_name")) {
        nextRecord.reported_funder_name = null;
      }
      return nextRecord;
    });
  }

  function normalizeSimilarProjectBundle(bundle) {
    if (!Array.isArray(bundle.candidates)) bundle.candidates = [];
    if (!Array.isArray(bundle.sources)) bundle.sources = [];
    if (!bundle.result || typeof bundle.result !== "object") {
      bundle.result = { status: "completed", matches: [], caveats: [] };
    }
    if (!Array.isArray(bundle.result.matches)) bundle.result.matches = [];
    if (!Array.isArray(bundle.result.caveats)) bundle.result.caveats = [];
    if (!bundle.review || typeof bundle.review !== "object") {
      bundle.review = pendingReview();
    }
    bundle.candidates = bundle.candidates.map((candidate) => ({
      ...candidate,
      project_tags: Array.isArray(candidate?.project_tags) ? candidate.project_tags : [],
      hazards: Array.isArray(candidate?.hazards) ? candidate.hazards : [],
      interventions: Array.isArray(candidate?.interventions) ? candidate.interventions : [],
      known_gaps: Array.isArray(candidate?.known_gaps) ? candidate.known_gaps : [],
      evidence: Array.isArray(candidate?.evidence) ? candidate.evidence : [],
    }));
    bundle.result.matches = bundle.result.matches.map((match) => ({
      ...match,
      evidence: Array.isArray(match?.evidence) ? match.evidence : [],
      matched_tags: Array.isArray(match?.matched_tags) ? match.matched_tags : [],
      caveats: Array.isArray(match?.caveats) ? match.caveats : [],
      fit_rationale: match?.fit_rationale ?? "",
    }));
  }

  function pendingReview() {
    return {
      status: "pending_review",
      reviewer: null,
      reviewed_at: null,
      notes: [],
    };
  }

  function validateBundle(bundle, mode) {
    if (!bundle || typeof bundle !== "object") {
      throw new Error("expected a JSON object");
    }
    if (!bundle.run_id || !bundle.schema_version) {
      throw new Error("run_id and schema_version are required");
    }
    if (mode === SIMILAR_PROJECT_MODE) {
      if (!bundle.search_request || !Array.isArray(bundle.candidates) || !bundle.result) {
        throw new Error(
          "search_request, candidates, and result are required for similar-project review",
        );
      }
      if (!Array.isArray(bundle.result.matches) || !Array.isArray(bundle.result.caveats)) {
        throw new Error("result.matches and result.caveats are required");
      }
      return;
    }
    if (!bundle.funder || !Array.isArray(bundle.funding_records)) {
      throw new Error("funder and funding_records are required");
    }
    if (bundle.funding_records.filter((record) => record.is_opportunity).length !== 1) {
      throw new Error("funding_records must contain exactly one opportunity");
    }
  }

  function renderWorkspace() {
    const { bundle, mode } = state;
    configureModeCopy(mode);
    view.emptyState.hidden = true;
    view.workspace.hidden = false;
    view.saveButton.disabled = false;
    view.reviewStatus.value = bundle.review?.status || "pending_review";
    view.reviewerName.value = bundle.review?.reviewer || "";
    view.reviewNotes.value = (bundle.review?.notes || []).join("\n");
    if (mode === SIMILAR_PROJECT_MODE) {
      renderSimilarProjectWorkspace();
    } else {
      renderReferenceDataWorkspace();
    }
    updateSelectionCount();
    showInspector();
  }

  function configureModeCopy(mode) {
    if (mode === SIMILAR_PROJECT_MODE) {
      view.pageTitle.textContent = "Similar project review";
      view.saveButton.textContent = "Save similar-project review";
      view.emptyStateLabel.textContent = "Pending-review artifacts";
      view.emptyStateTitle.textContent = "Open similar-project search JSON";
      view.emptyStateDescription.textContent = (
        "Review the current project, inspect selected similar-project matches, "
        + "edit fit rationale, matched tags, and caveats, then save a separate local review file."
      );
      view.workspaceLabel.textContent = "Current search result";
      view.countLabel1.textContent = "Candidates";
      view.countLabel2.textContent = "Matches";
      view.countLabel3.textContent = "Evidence";
      view.countLabel4.textContent = "Caveats";
      view.reviewMetaLabel.textContent = "Review metadata";
      view.saveHelpText.innerHTML = (
        "Saving creates a local <code>&lt;run_id&gt;.similar-project-review.json</code> file. "
        + "The search JSON is unchanged and the browser never writes to the database."
      );
      view.sectionNav.setAttribute("aria-label", "Similar-project review sections");
      return;
    }
    view.pageTitle.textContent = "Research review";
    view.saveButton.textContent = "Save review";
    view.emptyStateLabel.textContent = "Pending-review artifacts";
    view.emptyStateTitle.innerHTML = "Open &lt;run_id&gt;.research.json";
    view.emptyStateDescription.innerHTML = (
      "Review the funded-project findings, select one canonical funder per "
      + "funded project, curate project tags, inspect the evidence, and save a "
      + "separate local review file. Older <code>research_bundle.json</code> "
      + "files still load for inspection."
    );
    view.workspaceLabel.textContent = "Current bundle";
    view.countLabel1.textContent = "Sources";
    view.countLabel2.textContent = "Evidence";
    view.countLabel3.textContent = "Gaps";
    view.countLabel4.textContent = "Conflicts";
    view.reviewMetaLabel.textContent = "Review metadata";
    view.saveHelpText.innerHTML = (
      "Saving creates a local <code>&lt;run_id&gt;.review.json</code> file. "
      + "The research JSON is unchanged and the browser never writes to the database."
    );
    view.sectionNav.setAttribute("aria-label", "Research sections");
  }

  function renderReferenceDataWorkspace() {
    const { bundle } = state;
    const opportunity = bundle.funding_records.find((record) => record.is_opportunity);
    view.programName.textContent = opportunity?.name || "Unnamed program";
    view.runMeta.textContent = [
      bundle.funder?.name || null,
      bundle.run_metadata?.model_name
        ? `Researched with ${bundle.run_metadata.model_name}`
        : null,
    ].filter(Boolean).join(" | ");
    setCount("sourceCount", bundle.sources);
    setCount("evidenceCount", bundle.evidence);
    setCount("gapCount", bundle.gaps);
    setCount("conflictCount", bundle.conflicts);
    renderNavigation(REFERENCE_DATA_SECTIONS);
    renderReferenceDataSections();
  }

  function renderSimilarProjectWorkspace() {
    const { bundle } = state;
    const matchCount = bundle.result.matches.length;
    const evidenceCount = bundle.result.matches.reduce(
      (total, match) => total + (Array.isArray(match.evidence) ? match.evidence.length : 0),
      0,
    );
    const caveatCount = bundle.result.matches.reduce(
      (total, match) => total + (Array.isArray(match.caveats) ? match.caveats.length : 0),
      bundle.result.caveats.length,
    );
    view.programName.textContent = "Selected similar projects";
    view.runMeta.textContent = [
      bundle.run_metadata?.model_name
        ? `Generated with ${bundle.run_metadata.model_name}`
        : null,
      `${matchCount} selected matches from ${bundle.candidates.length} candidates`,
    ].filter(Boolean).join(" | ");
    view.sourceCount.textContent = bundle.candidates.length;
    view.evidenceCount.textContent = matchCount;
    view.gapCount.textContent = evidenceCount;
    view.conflictCount.textContent = caveatCount;
    renderNavigation(SIMILAR_PROJECT_SECTIONS);
    renderSimilarProjectSections();
  }

  function renderNavigation(sections) {
    view.sectionNav.replaceChildren();
    sections.forEach(([id, title]) => {
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = title;
      link.addEventListener("click", () => {
        const section = document.getElementById(id);
        if (section instanceof HTMLDetailsElement) section.open = true;
      });
      view.sectionNav.append(link);
    });
  }

  function renderReferenceDataSections() {
    view.editorSections.replaceChildren();
    REFERENCE_DATA_SECTIONS.forEach(([id, title, description, keys]) => {
      const section = createSection(id, title, description);
      const content = section.querySelector(".section-content");
      keys.forEach((key) => {
        if (key in state.bundle) {
          renderValue(content, key, state.bundle[key], key, [key]);
        }
      });
      if (!content.children.length) {
        content.append(element("p", "empty", "Nothing found."));
      }
      view.editorSections.append(section);
    });
    renderUnmappedReviewItems();
  }

  function renderSimilarProjectSections() {
    view.editorSections.replaceChildren();
    renderCurrentProjectSection();
    renderSelectedMatchesSection();
    renderResultCaveatsSection();
  }

  function renderCurrentProjectSection() {
    const section = createSection(...SIMILAR_PROJECT_SECTIONS[0]);
    const content = section.querySelector(".section-content");
    const grid = element("div", "readonly-grid");
    const request = state.bundle.search_request || {};
    buildCurrentProjectCards(request, state.bundle.candidates).forEach((item) => {
      grid.append(createReadonlyCard(item.label, item.value));
    });
    if (!grid.children.length) {
      content.append(element("p", "empty", "No current-project fields were supplied."));
    } else {
      content.append(grid);
    }
    view.editorSections.append(section);
  }

  function buildCurrentProjectCards(request, candidates) {
    const currentFunder = (candidates || []).find(
      (candidate) => String(candidate.funder_id) === String(request.funder_id),
    );
    return [
      ["Funder", currentFunder?.funder_name],
      ["Category", request.category],
      ["Sector", request.sector],
      ["Region", request.region],
      ["Country", request.country],
      ["Finance route", request.finance_route],
      ["Instrument type", request.instrument_type],
      ["Applicant type", request.applicant_type],
      ["Hazards", formatList(request.hazards)],
      ["Interventions", formatList(request.interventions)],
      ["Project tags", formatList(request.project_tags)],
      ["Known gaps", formatList(request.known_gaps)],
    ]
      .filter(([, value]) => hasValue(value))
      .map(([label, value]) => ({ label, value }));
  }

  function createReadonlyCard(label, value) {
    const card = element("article", "readonly-card");
    card.append(
      element("h3", "", label),
      element("p", "", String(value)),
    );
    return card;
  }

  function renderSelectedMatchesSection() {
    const section = createSection(...SIMILAR_PROJECT_SECTIONS[1]);
    const content = section.querySelector(".section-content");
    const matches = state.bundle.result.matches || [];
    if (!matches.length) {
      content.append(element("p", "empty", "No selected matches were provided."));
      view.editorSections.append(section);
      return;
    }

    matches.forEach((match, index) => {
      const candidate = candidateForMatch(match);
      const record = element("details", "record");
      record.open = true;
      const summary = element("summary", "group-summary");
      summary.append(
        element(
          "h3",
          "",
          candidate?.name || `Match ${index + 1}`,
        ),
        element("span", "collapse-label"),
      );
      const body = element("div", "group-content");
      body.append(
        createMatchToggleRow(match, candidate),
        createCandidateSummary(candidate),
        createSimilarFieldRow(
          "Fit rationale",
          match.fit_rationale,
          `result.matches[${match.funding_record_id}].fit_rationale`,
          "Edit the rationale kept in the reviewed similar-project result.",
          { key: "fit_rationale", original: match.fit_rationale, match },
        ),
        createSimilarFieldRow(
          "Matched tags",
          match.matched_tags || [],
          `result.matches[${match.funding_record_id}].matched_tags`,
          "One matched tag per line. Keep only retained normalized overlap tags.",
          { key: "matched_tags", original: match.matched_tags || [], match },
        ),
        createSimilarFieldRow(
          "Caveats",
          match.caveats || [],
          `result.matches[${match.funding_record_id}].caveats`,
          "One caveat per line.",
          { key: "caveats", original: match.caveats || [], match },
        ),
      );
      record.append(summary, body);
      content.append(record);
    });
    view.editorSections.append(section);
  }

  function createMatchToggleRow(match, candidate) {
    const path = `result.matches[${match.funding_record_id}]`;
    state.decisions.set(path, {
      target_path: path,
      segments: ["result", "matches", String(match.funding_record_id)],
      selected: true,
      original_value: clone(match),
      reviewed_value: clone(match),
      kind: "similar_match",
    });

    const wrapper = element("div", "match-review-header");
    const toggle = element("label", "match-toggle");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.setAttribute("aria-label", `Include ${candidate?.name || "match"}`);
    checkbox.addEventListener("change", () => {
      const decision = state.decisions.get(path);
      decision.selected = checkbox.checked;
      wrapper.classList.toggle("excluded", !checkbox.checked);
      toggleSimilarMatchControls(path, checkbox.checked);
      updateSelectionCount();
      showSimilarProjectInspector(match, path, "match");
    });

    const copy = element("div", "");
    copy.append(
      element("strong", "", candidate?.name || "Selected match"),
      element(
        "p",
        "",
        buildMatchMeta(candidate, match),
      ),
    );
    toggle.append(checkbox, copy);
    wrapper.append(toggle);

    const badges = element("div", "badges");
    badges.append(badge(`${(match.evidence || []).length} evidence`, "evidence"));
    if (match.matched_tags?.length) {
      badges.append(badge(`${match.matched_tags.length} matched tags`, "gap"));
    }
    if (match.caveats?.length) {
      badges.append(badge(`${match.caveats.length} caveats`, "conflict"));
    }
    wrapper.append(badges);
    return wrapper;
  }

  function buildMatchMeta(candidate, match) {
    const parts = [];
    if (candidate?.applicant_name) parts.push(candidate.applicant_name);
    if (candidate?.city || candidate?.country) {
      parts.push([candidate.city, candidate.country].filter(Boolean).join(", "));
    }
    if (candidate?.award_amount || candidate?.currency || candidate?.award_year) {
      parts.push(formatAward(candidate));
    }
    parts.push(`Decision: ${match.decision}`);
    return parts.filter(Boolean).join(" | ");
  }

  function createCandidateSummary(candidate) {
    const wrapper = element("article", "candidate-summary");
    wrapper.append(element("h4", "", "Candidate context"));
    if (!candidate) {
      wrapper.append(element("p", "", "Candidate display data was not supplied."));
      return wrapper;
    }
    const meta = element(
      "p",
      "candidate-meta",
      [
        candidate.funder_name,
        candidate.category,
        candidate.sector,
        candidate.region_scope,
      ].filter(Boolean).join(" | "),
    );
    if (meta.textContent) wrapper.append(meta);
    if (candidate.summary) {
      wrapper.append(element("p", "", candidate.summary));
    }
    const details = [];
    if (candidate.hazards?.length) details.push(`Hazards: ${candidate.hazards.join(", ")}`);
    if (candidate.interventions?.length) {
      details.push(`Interventions: ${candidate.interventions.join(", ")}`);
    }
    if (candidate.project_tags?.length) {
      details.push(`Project tags: ${candidate.project_tags.join(", ")}`);
    }
    if (candidate.known_gaps?.length) {
      details.push(`Known gaps: ${candidate.known_gaps.join(", ")}`);
    }
    details.forEach((line) => wrapper.append(element("p", "", line)));
    return wrapper;
  }

  function createSimilarFieldRow(label, value, path, note, config) {
    const decision = {
      target_path: path,
      segments: pathToSegments(path),
      selected: true,
      original_value: clone(config.original),
      reviewed_value: clone(config.original),
      kind: "similar_field",
      match_id: String(config.match.funding_record_id),
      field_key: config.key,
    };
    state.decisions.set(path, decision);

    const row = element("div", "field-row");
    row.dataset.parentMatch = `result.matches[${config.match.funding_record_id}]`;
    const spacer = document.createElement("div");
    const labelNode = element("div", "field-label", label);
    if (note) labelNode.append(element("span", "field-note", note));

    const controlBox = element("div", "field-control");
    const control = createControl(config.key, value);
    control.value = formatValue(config.key, value);
    control.setAttribute("aria-label", label);
    control.addEventListener("focus", () => {
      showSimilarProjectInspector(config.match, path, config.key);
    });
    control.addEventListener("input", () => {
      decision.reviewed_value = parseValue(config.key, config.original, control.value);
    });
    if (MONEY_KEYS.has(config.key)) {
      control.addEventListener("blur", () => {
        control.value = formatValue(config.key, decision.reviewed_value);
      });
    }

    const badges = element("div", "badges");
    if (config.match.evidence?.length) {
      badges.append(badge(`${config.match.evidence.length} evidence`, "evidence"));
    }
    if (config.match.caveats?.length && config.key !== "caveats") {
      badges.append(badge(`${config.match.caveats.length} caveats`, "conflict"));
    }
    controlBox.append(control, badges);
    row.addEventListener("click", () => showSimilarProjectInspector(config.match, path, config.key));
    row.append(spacer, labelNode, controlBox);
    return row;
  }

  function toggleSimilarMatchControls(matchPath, isSelected) {
    const rows = view.editorSections.querySelectorAll(`[data-parent-match="${matchPath}"]`);
    rows.forEach((row) => {
      row.classList.toggle("excluded", !isSelected);
      row.querySelectorAll("input, textarea, select").forEach((control) => {
        control.disabled = !isSelected;
      });
    });
  }

  function renderResultCaveatsSection() {
    const section = createSection(...SIMILAR_PROJECT_SECTIONS[2]);
    const content = section.querySelector(".section-content");
    content.append(
      createSimilarFieldRow(
        "Result caveats",
        state.bundle.result.caveats || [],
        "result.caveats",
        "One caveat per line.",
        {
          key: "caveats",
          original: state.bundle.result.caveats || [],
          match: { funding_record_id: "result-caveats", evidence: [], caveats: [] },
        },
      ),
    );
    view.editorSections.append(section);
  }

  function candidateForMatch(match) {
    return findCandidateForMatch(state.bundle, match);
  }

  function findCandidateForMatch(bundle, match) {
    const targetId = String(match?.funding_record_id);
    return (bundle?.candidates || []).find(
      (candidate) => String(candidate.funding_record_id) === targetId,
    ) || null;
  }

  function createSection(id, title, description) {
    const section = element("details", "editor-section");
    section.id = id;
    section.open = true;
    const summary = element("summary", "section-summary");
    const summaryText = element("span", "section-summary-text");
    summaryText.append(
      element("h2", "", title),
      element("span", "section-description", description),
    );
    summary.append(summaryText, element("span", "collapse-label"));
    const content = element("div", "section-content");
    section.append(summary, content);
    return section;
  }

  function renderUnmappedReviewItems() {
    const decisionPaths = visibleDecisions().map((item) => item.target_path);
    const collections = ["evidence", "gaps", "conflicts"];
    const unmapped = [];
    collections.forEach((collection) => {
      itemsWithoutRelatedPath(state.bundle?.[collection] || [], decisionPaths)
        .forEach((item) => unmapped.push({ collection, item }));
    });
    if (!unmapped.length) return;

    const section = createSection(
      "other-review-issues",
      "Needs follow-up",
      "Useful facts the official sources did not establish.",
    );
    section.classList.add("review-issues");
    const content = section.querySelector(".section-content");
    unmapped.forEach(({ collection, item }) => {
      let reviewItem;
      if (collection === "evidence") {
        reviewItem = evidenceItem(item);
      } else if (collection === "gaps") {
        reviewItem = issueItem("Gap", item.reason, "gap");
      } else {
        const candidates = JSON.stringify(item.candidate_values);
        reviewItem = issueItem(
          "Conflict",
          `${item.explanation} Candidates: ${candidates}`,
          "conflict",
        );
      }
      reviewItem.prepend(element("h3", "issue-title", issueTitle(item.target_path)));
      content.append(reviewItem);
    });
    view.editorSections.prepend(section);
  }

  function renderValue(parent, key, value, path, segments) {
    if (isReferenceKey(key)) {
      retainReference(value, path, segments);
      return;
    }
    if (Array.isArray(value)) {
      renderArray(parent, key, value, path, segments);
    } else if (value !== null && typeof value === "object") {
      renderObject(parent, key, value, path, segments);
    } else {
      parent.append(createField(key, value, path, segments));
    }
  }

  function renderObject(parent, key, value, path, segments) {
    const { group, content } = disclosureGroup("nested", humanize(key));
    Object.entries(value).forEach(([childKey, childValue]) => {
      renderValue(
        content,
        childKey,
        childValue,
        `${path}.${childKey}`,
        [...segments, childKey],
      );
    });
    if (content.children.length) parent.append(group);
  }

  function renderArray(parent, key, values, path, segments) {
    if (!values.length) {
      const { group, content } = disclosureGroup("nested", humanize(key));
      content.append(element("p", "empty", "Nothing found."));
      parent.append(group);
      return;
    }
    if (values.every((item) => item === null || typeof item !== "object")) {
      parent.append(createField(key, values, path, segments));
      return;
    }
    values.forEach((record, index) => {
      const collectionIdentity = COLLECTION_IDENTITY_KEYS[key];
      const identity = collectionIdentity && record[collectionIdentity]
        ? collectionIdentity
        : IDENTITY_KEYS.find((field) => record[field]);
      const stableId = identity ? record[identity] : index;
      const recordPath = `${path}[${stableId}]`;
      const { group, content } = disclosureGroup(
        "record",
        recordTitle(key, record, index),
      );

      if (key === "funding_records" && !record.is_opportunity) {
        renderFundedProjectReview(content, record, recordPath, [...segments, index]);
      }

      Object.entries(record).forEach(([childKey, childValue]) => {
        if (shouldSkipRecordField(key, record, childKey)) return;
        renderValue(
          content,
          childKey,
          childValue,
          `${recordPath}.${childKey}`,
          [...segments, index, childKey],
        );
      });
      if (content.children.length) parent.append(group);
    });
  }

  function shouldSkipRecordField(collectionKey, record, childKey) {
    if (collectionKey !== "funding_records") return false;
    if (record.is_opportunity && childKey === "project_tags") return true;
    return REVIEW_ONLY_RECORD_KEYS.has(childKey);
  }

  function renderFundedProjectReview(parent, record, recordPath, segments) {
    parent.append(
      createFunderSelectionField(
        record,
        recordPath,
        `${recordPath}.selected_funder_id`,
        [...segments, "selected_funder_id"],
      ),
      createProjectTagsField(
        record,
        `${recordPath}.project_tags`,
        [...segments, "project_tags"],
      ),
    );
  }

  function createFunderSelectionField(record, recordPath, path, segments) {
    const decision = {
      target_path: path,
      segments,
      selected: true,
      original_value: clone(record.selected_funder_id),
      reviewed_value: clone(record.selected_funder_id),
    };
    state.decisions.set(path, decision);

    const row = element("div", "field-row");
    const spacer = document.createElement("div");
    const label = element("div", "field-label", "Canonical funder");
    if (record.reported_funder_name) {
      label.append(
        element("span", "field-note", `Reported by source: ${record.reported_funder_name}`),
      );
    }

    const controlBox = element("div", "field-control");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Canonical funder");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select one canonical funder";
    select.append(placeholder);
    (record.candidate_funders || []).forEach((candidate) => {
      const option = document.createElement("option");
      option.value = String(candidate.funder_id);
      option.textContent = candidate.name;
      select.append(option);
    });
    select.value = decision.reviewed_value ? String(decision.reviewed_value) : "";
    select.addEventListener("focus", () => {
      showInspector("reported_funder_name", `${recordPath}.reported_funder_name`);
    });
    select.addEventListener("change", () => {
      decision.reviewed_value = select.value || null;
    });

    const badges = element("div", "badges");
    badges.append(badge(`${(record.candidate_funders || []).length} candidates`, "evidence"));
    controlBox.append(select, badges);

    if (record.candidate_funders?.length) {
      const candidateList = element("div", "candidate-list");
      record.candidate_funders.forEach((candidate) => {
        const card = element("div", "candidate-card");
        card.append(
          element("strong", "", candidate.name),
          element("p", "", candidate.match_reason),
        );
        candidateList.append(card);
      });
      controlBox.append(candidateList);
    } else {
      controlBox.append(
        element(
          "p",
          "candidate-empty",
          "No canonical funder candidates were proposed for this funded project.",
        ),
      );
    }

    row.addEventListener("click", () => {
      showInspector("reported_funder_name", `${recordPath}.reported_funder_name`);
    });
    row.append(spacer, label, controlBox);
    return row;
  }

  function createProjectTagsField(record, path, segments) {
    const decision = {
      target_path: path,
      segments,
      selected: true,
      original_value: clone(record.project_tags || []),
      reviewed_value: clone(record.project_tags || []),
    };
    state.decisions.set(path, decision);

    const row = element("div", "field-row");
    const spacer = document.createElement("div");
    const label = element("div", "field-label", "Project tags");
    label.append(element("span", "field-note", "One tag per line. Reviewer-curated only."));

    const controlBox = element("div", "field-control");
    const textarea = document.createElement("textarea");
    textarea.rows = Math.min(Math.max((record.project_tags || []).length || 2, 2), 6);
    textarea.value = (record.project_tags || []).join("\n");
    textarea.setAttribute("aria-label", "Project tags");
    textarea.addEventListener("focus", () => showInspector("project_tags", path));
    textarea.addEventListener("input", () => {
      decision.reviewed_value = textarea.value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    });

    controlBox.append(textarea);
    row.addEventListener("click", () => showInspector("project_tags", path));
    row.append(spacer, label, controlBox);
    return row;
  }

  function disclosureGroup(className, title) {
    const group = element("details", className);
    group.open = true;
    const summary = element("summary", "group-summary");
    summary.append(
      element("h3", "", title),
      element("span", "collapse-label"),
    );
    const content = element("div", "group-content");
    group.append(summary, content);
    return { group, content };
  }

  function retainReference(value, path, segments) {
    state.decisions.set(path, {
      target_path: path,
      segments,
      selected: true,
      original_value: clone(value),
      reviewed_value: clone(value),
      internal: true,
    });
  }

  function createField(key, value, path, segments) {
    const required = isRequiredReviewField(segments);
    const decision = {
      target_path: path,
      segments,
      selected: required || hasValue(value),
      original_value: clone(value),
      reviewed_value: clone(value),
    };
    state.decisions.set(path, decision);

    const evidence = relatedItems("evidence", path);
    const gaps = relatedItems("gaps", path);
    const conflicts = relatedItems("conflicts", path);
    const row = element("div", "field-row");
    if (!decision.selected) row.classList.add("excluded");
    if (gaps.length || conflicts.length) row.classList.add("warning");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = decision.selected;
    checkbox.disabled = required;
    checkbox.setAttribute("aria-label", `Use ${humanize(key)}`);

    const label = element("div", "field-label", humanize(key));
    if (!hasValue(value)) label.append(element("span", "", "Not found"));
    if (required) label.append(element("span", "field-note", "Required for import."));

    const controlBox = element("div", "field-control");
    const control = createControl(key, value);
    control.value = formatValue(key, value);
    control.disabled = !decision.selected;
    control.setAttribute("aria-label", humanize(key));
    const inspect = () => showInspector(key, path);
    row.addEventListener("click", inspect);
    control.addEventListener("focus", inspect);
    control.addEventListener("input", () => {
      decision.reviewed_value = parseValue(key, value, control.value);
    });
    if (MONEY_KEYS.has(key)) {
      control.addEventListener("blur", () => {
        control.value = formatValue(key, decision.reviewed_value);
      });
    }
    checkbox.addEventListener("change", () => {
      decision.selected = checkbox.checked;
      control.disabled = !checkbox.checked;
      row.classList.toggle("excluded", !checkbox.checked);
      updateSelectionCount();
      inspect();
    });

    const badges = element("div", "badges");
    if (evidence.length) badges.append(badge(`${evidence.length} evidence`, "evidence"));
    if (gaps.length) badges.append(badge(`${gaps.length} gap`, "gap"));
    if (conflicts.length) badges.append(badge(`${conflicts.length} conflict`, "conflict"));
    controlBox.append(control, badges);
    row.append(checkbox, label, controlBox);
    return row;
  }

  function isRequiredReviewField(segments) {
    const [collection, second, third, fourth, fifth] = segments;
    if (collection === "funder") return second === "name";
    if (collection === "funding_records") return third === "name";
    if (collection === "funder_criteria") {
      return ["criterion_type", "label", "requirement_text"].includes(third);
    }
    if (collection !== "funder_templates") return false;
    if (third === "template_name") return true;
    return third === "chapter_schema" && fifth === "title" && fourth !== undefined;
  }

  function createControl(key, value) {
    if (Array.isArray(value) || isLongText(key, value)) {
      const control = document.createElement("textarea");
      control.rows = Array.isArray(value) ? Math.min(Math.max(value.length, 2), 6) : 3;
      return control;
    }
    if (typeof value === "boolean" || BOOLEAN_KEYS.has(key)) {
      const control = document.createElement("select");
      [["", "Not set"], ["true", "Yes"], ["false", "No"]].forEach(([optionValue, label]) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = label;
        control.append(option);
      });
      return control;
    }
    const control = document.createElement("input");
    if (MONEY_KEYS.has(key)) {
      control.type = "text";
      control.inputMode = "decimal";
    } else {
      control.type = typeof value === "number" || NUMBER_KEYS.has(key)
        ? "number"
        : "text";
    }
    if (control.type === "number") control.step = "any";
    if (value === null) control.placeholder = "Enter a value";
    return control;
  }

  function showInspector(key, path) {
    if (state.mode === SIMILAR_PROJECT_MODE) {
      const match = matchFromPath(path);
      if (match) {
        showSimilarProjectInspector(match, path, key);
        return;
      }
    }

    view.inspectorPanel.hidden = !path;
    view.reviewLayout.classList.toggle("inspector-open", Boolean(path));
    if (!path) return;
    view.inspectorTitle.textContent = humanize(key);
    view.inspectorPath.textContent = displayPath(path);
    view.inspectorContent.replaceChildren();
    const evidence = relatedItems("evidence", path);
    const gaps = relatedItems("gaps", path);
    const conflicts = relatedItems("conflicts", path);
    evidence.forEach((item) => view.inspectorContent.append(evidenceItem(item)));
    gaps.forEach((item) => view.inspectorContent.append(issueItem("Gap", item.reason, "gap")));
    conflicts.forEach((item) => {
      const candidates = JSON.stringify(item.candidate_values);
      view.inspectorContent.append(
        issueItem("Conflict", `${item.explanation} Candidates: ${candidates}`, "conflict"),
      );
    });
    if (!evidence.length && !gaps.length && !conflicts.length) {
      view.inspectorContent.append(
        element("p", "muted", "No field-level evidence or issue is mapped here."),
      );
    }
  }

  function showSimilarProjectInspector(match, path, key) {
    view.inspectorPanel.hidden = false;
    view.reviewLayout.classList.add("inspector-open");
    const candidate = candidateForMatch(match);
    view.inspectorTitle.textContent = candidate?.name || humanize(key || "match");
    view.inspectorPath.textContent = displayPath(path);
    view.inspectorContent.replaceChildren();
    (match.evidence || []).forEach((item) => {
      view.inspectorContent.append(evidenceItem(item));
    });
    if (key === "caveats" && (match.caveats || []).length) {
      match.caveats.forEach((item) => {
        view.inspectorContent.append(issueItem("Caveat", item, "conflict"));
      });
    }
    if (!(match.evidence || []).length && !(match.caveats || []).length) {
      view.inspectorContent.append(
        element("p", "muted", "No retained evidence or caveats are mapped here."),
      );
    }
  }

  function matchFromPath(path) {
    const match = /^result\.matches\[([^\]]+)\]/.exec(String(path || ""));
    if (!match) return null;
    const targetId = match[1];
    return (state.bundle?.result?.matches || []).find(
      (item) => String(item.funding_record_id) === targetId,
    ) || null;
  }

  function evidenceItem(item) {
    const wrapper = element("article", "evidence-item");
    wrapper.append(badge("Source", "evidence"), element("p", "", item.quote_or_summary));
    const source = (state.bundle.sources || []).find((entry) => entry.source_ref === item.source_ref);
    if (source?.url) {
      const link = element("a", "", source.title || "Open source");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      wrapper.append(link);
    }
    return wrapper;
  }

  function issueItem(label, text, kind) {
    const wrapper = element("article", "issue-item");
    wrapper.append(badge(label, kind), element("p", "", text));
    return wrapper;
  }

  function relatedItems(collection, path) {
    return (state.bundle?.[collection] || []).filter((item) => pathsRelated(path, item.target_path));
  }

  function pathsRelated(left, right) {
    const leftTokens = pathTokens(left);
    const rightTokens = pathTokens(right);
    const sharedLength = Math.min(leftTokens.length, rightTokens.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const leftToken = leftTokens[index];
      const rightToken = rightTokens[index];
      if (leftToken !== "*" && rightToken !== "*" && leftToken !== rightToken) {
        return false;
      }
    }
    return sharedLength > 0;
  }

  function pathTokens(path) {
    const parts = String(path).match(/[^.\[\]]+|\[[^\]]*\]/g) || [];
    return parts.map((part) => {
      const value = part.startsWith("[") ? part.slice(1, -1) : part;
      if (value.trim() === "*") return "*";
      return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    });
  }

  function pathToSegments(path) {
    const parts = String(path).match(/[^.\[\]]+|\[[^\]]*\]/g) || [];
    return parts.map((part) => {
      if (part.startsWith("[") && part.endsWith("]")) {
        return part.slice(1, -1);
      }
      return part;
    });
  }

  function itemsWithoutRelatedPath(items, paths) {
    return items.filter(
      (item) => !paths.some((path) => pathsRelated(path, item.target_path)),
    );
  }

  function saveUpdate() {
    try {
      const update = buildUpdate();
      const fileName = state.mode === SIMILAR_PROJECT_MODE
        ? `${state.bundle.run_id}.similar-project-review.json`
        : `${state.bundle.run_id}.review.json`;
      const blob = new Blob([`${JSON.stringify(update, null, 2)}\n`], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      showStatus(`Saved ${fileName}`);
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  function buildUpdate() {
    const now = new Date().toISOString();
    const review = {
      status: view.reviewStatus.value,
      reviewer: view.reviewerName.value.trim() || null,
      reviewed_at: now,
      notes: view.reviewNotes.value.split("\n").map((note) => note.trim()).filter(Boolean),
    };
    if (state.mode === SIMILAR_PROJECT_MODE) {
      const errors = collectSimilarProjectReviewErrors(state.bundle, state.decisions);
      if (errors.length) {
        throw new Error(errors.join(" "));
      }
      const decisions = buildSimilarProjectReviewDecisions(state.bundle, state.decisions);
      return buildSimilarProjectReviewArtifact({
        bundle: state.bundle,
        review,
        decisions,
        reviewedSimilarProjects: buildReviewedSimilarProjects(state.bundle, state.decisions),
        savedAt: now,
      });
    }

    const errors = collectFunderSelectionErrors(state.bundle, state.decisions);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
    const decisions = visibleDecisions().map((decision) => ({
      target_path: decision.target_path,
      selected: decision.selected,
      original_value: decision.original_value,
      reviewed_value: decision.reviewed_value,
      evidence_refs: relatedItems("evidence", decision.target_path).map((item) => item.evidence_ref),
    }));
    return buildReviewArtifact({
      bundle: state.bundle,
      review,
      decisions,
      reviewedReferenceData: buildReviewedReferenceData(),
      savedAt: now,
    });
  }

  function buildReviewArtifact({
    bundle, review, decisions, reviewedReferenceData, savedAt,
  }) {
    return {
      run_id: bundle.run_id,
      schema_version: bundle.schema_version,
      update_type: REFERENCE_DATA_UPDATE_TYPE,
      saved_at: savedAt,
      review,
      decisions,
      reviewed_reference_data: reviewedReferenceData,
    };
  }

  function buildSimilarProjectReviewArtifact({
    bundle, review, decisions, reviewedSimilarProjects, savedAt,
  }) {
    return {
      run_id: bundle.run_id,
      schema_version: bundle.schema_version,
      update_type: SIMILAR_PROJECT_UPDATE_TYPE,
      saved_at: savedAt,
      review,
      decisions,
      reviewed_similar_projects: reviewedSimilarProjects,
    };
  }

  function buildSimilarProjectReviewDecisions(bundle, decisions) {
    const serialized = [];
    (bundle.result.matches || []).forEach((match) => {
      const matchId = String(match.funding_record_id);
      const matchPath = `result.matches[${matchId}]`;
      const includeDecision = decisions.get(matchPath);
      const reviewedMatch = buildReviewedSimilarMatch(match, decisions);
      const candidate = findCandidateForMatch(bundle, match);
      serialized.push({
        target_path: matchPath,
        selected: includeDecision?.selected !== false,
        original_value: buildSerializableSimilarMatchValue(match, candidate),
        reviewed_value: buildSerializableSimilarMatchValue(reviewedMatch, candidate),
        evidence_refs: (match.evidence || []).map((item) => item.evidence_ref),
      });
      ["fit_rationale", "matched_tags", "caveats"].forEach((field) => {
        const path = `${matchPath}.${field}`;
        const decision = decisions.get(path);
        if (!decision) return;
        serialized.push({
          target_path: path,
          selected: includeDecision?.selected !== false,
          original_value: clone(decision.original_value),
          reviewed_value: clone(decision.reviewed_value),
          evidence_refs: (match.evidence || []).map((item) => item.evidence_ref),
        });
      });
    });

    const caveatDecision = decisions.get("result.caveats");
    if (caveatDecision) {
      serialized.push({
        target_path: "result.caveats",
        selected: true,
        original_value: clone(caveatDecision.original_value),
        reviewed_value: clone(caveatDecision.reviewed_value),
        evidence_refs: [],
      });
    }
    return serialized;
  }

  function buildSerializableSimilarMatchValue(matchValue, candidate) {
    const snapshot = clone(matchValue) || {};
    if (!candidate) return snapshot;
    snapshot.candidate_context = {
      funding_record_id: clone(candidate.funding_record_id),
      funder_id: clone(candidate.funder_id),
      funder_name: clone(candidate.funder_name ?? null),
      candidate_name: clone(candidate.name ?? null),
    };
    return snapshot;
  }

  function buildReviewedSimilarProjects(bundle, decisions) {
    const matches = (bundle.result.matches || [])
      .map((match) => {
        const matchPath = `result.matches[${match.funding_record_id}]`;
        const includeDecision = decisions.get(matchPath);
        if (includeDecision?.selected === false) return null;
        return buildReviewedSimilarMatch(match, decisions);
      })
      .filter(Boolean);
    const caveatDecision = decisions.get("result.caveats");
    return {
      status: bundle.result.status || "completed",
      matches,
      caveats: clone(caveatDecision?.reviewed_value ?? bundle.result.caveats ?? []),
    };
  }

  function collectSimilarProjectReviewErrors(bundle, decisions) {
    const errors = [];
    (bundle?.result?.matches || []).forEach((match) => {
      const matchPath = `result.matches[${match.funding_record_id}]`;
      if (decisions.get(matchPath)?.selected === false) return;
      const reviewed = buildReviewedSimilarMatch(match, decisions);
      const candidate = (bundle.candidates || []).find(
        (item) => String(item.funding_record_id) === String(match.funding_record_id),
      );
      const label = candidate?.name || String(match.funding_record_id);
      if (!String(reviewed.fit_rationale || "").trim()) {
        errors.push(`Enter a fit rationale for "${label}".`);
      }
      if (!(reviewed.evidence || []).length) {
        errors.push(`"${label}" must retain source evidence.`);
      }
      const tags = reviewed.matched_tags || [];
      if (new Set(tags).size !== tags.length) {
        errors.push(`Remove duplicate matched tags for "${label}".`);
      }
    });
    return errors;
  }

  function buildReviewedSimilarMatch(match, decisions) {
    const matchId = String(match.funding_record_id);
    return {
      funding_record_id: clone(match.funding_record_id),
      decision: "selected",
      fit_rationale: clone(
        decisions.get(`result.matches[${matchId}].fit_rationale`)?.reviewed_value
        ?? match.fit_rationale
      ),
      matched_tags: clone(
        decisions.get(`result.matches[${matchId}].matched_tags`)?.reviewed_value
        ?? match.matched_tags
      ),
      evidence: clone(match.evidence || []),
      caveats: clone(
        decisions.get(`result.matches[${matchId}].caveats`)?.reviewed_value
        ?? match.caveats
      ),
    };
  }

  function collectFunderSelectionErrors(bundle, decisions) {
    const errors = [];
    (bundle?.funding_records || []).forEach((record) => {
      if (record.is_opportunity) return;
      const path = `funding_records[${record.funding_record_ref}].selected_funder_id`;
      const decision = decisions.get(path);
      const selectedFunderId = decision?.reviewed_value ? String(decision.reviewed_value) : "";
      const candidateIds = new Set(
        (record.candidate_funders || []).map((candidate) => String(candidate.funder_id)),
      );
      if (!selectedFunderId) {
        errors.push(`Select one canonical funder for "${record.name}".`);
        return;
      }
      if (!candidateIds.has(selectedFunderId)) {
        errors.push(`"${record.name}" has an unknown selected canonical funder.`);
      }
    });
    return errors;
  }

  function buildReviewedReferenceData() {
    const result = { funder: { profile: {} } };
    [...state.decisions.values()].filter((item) => item.selected).forEach((item) => {
      setNestedValue(result, item.segments, item.reviewed_value);
    });
    return removeArrayHoles(result);
  }

  function setNestedValue(target, segments, value) {
    let current = target;
    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        current[segment] = clone(value);
        return;
      }
      if (current[segment] === undefined) {
        current[segment] = typeof segments[index + 1] === "number" ? [] : {};
      }
      current = current[segment];
    });
  }

  function removeArrayHoles(value) {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== undefined).map(removeArrayHoles);
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, removeArrayHoles(item)]),
      );
    }
    return value;
  }

  function createControlValue(raw, kind) {
    if (raw === "") return null;
    if (kind === "boolean") return raw === "true";
    if (kind === "number") return Number.isFinite(Number(raw)) ? Number(raw) : raw;
    return raw;
  }

  function parseValue(key, original, raw) {
    if (Array.isArray(original)) {
      return raw.split("\n").map((item) => item.trim()).filter(Boolean);
    }
    if (typeof original === "boolean" || BOOLEAN_KEYS.has(key)) {
      return createControlValue(raw, "boolean");
    }
    if (typeof original === "number" || NUMBER_KEYS.has(key)) {
      const normalized = MONEY_KEYS.has(key) ? raw.replace(/[,\s]/g, "") : raw;
      return createControlValue(normalized, "number");
    }
    return raw;
  }

  function formatValue(key, value) {
    if (value === null || value === undefined) return "";
    const numeric = Number(value);
    if (MONEY_KEYS.has(key) && Number.isFinite(numeric)) {
      return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }
    return Array.isArray(value) ? value.join("\n") : String(value);
  }

  function formatList(values) {
    return Array.isArray(values) ? values.join(", ") : values;
  }

  function formatAward(candidate) {
    const amount = candidate.award_amount && candidate.currency
      ? `${candidate.award_amount} ${candidate.currency}`
      : candidate.award_amount || candidate.currency;
    return [amount, candidate.award_year].filter(Boolean).join(" | ");
  }

  function updateSelectionCount() {
    const decisions = visibleDecisions();
    if (state.mode === SIMILAR_PROJECT_MODE) {
      const includedMatches = (state.bundle?.result?.matches || []).filter((match) => {
        const decision = state.decisions.get(`result.matches[${match.funding_record_id}]`);
        return decision?.selected !== false;
      }).length;
      view.selectionSummary.textContent = (
        `${includedMatches} of ${(state.bundle?.result?.matches || []).length} matches kept`
      );
      return;
    }
    const selected = decisions.filter((item) => item.selected).length;
    view.selectionSummary.textContent = `${selected} of ${decisions.length} fields selected`;
  }

  function recordTitle(key, record, index) {
    return record.name || record.title || record.label || record.template_name || `${humanize(key).replace(/s$/, "")} ${index + 1}`;
  }

  function issueTitle(path) {
    const tokens = pathTokens(path);
    const key = tokens[tokens.length - 1] || "research item";
    const labels = {
      co_financing: "Co-financing requirement",
      downstream_financing_status: "Downstream financing",
      underlying_investment_amount: "Underlying investment value",
      license_status: "Source reuse license",
    };
    return labels[key] || humanize(key);
  }

  function visibleDecisions() {
    return [...state.decisions.values()].filter((item) => !item.internal);
  }

  function isReferenceKey(key) {
    return key.endsWith("_ref") || key.endsWith("_reference") || key === "is_opportunity";
  }

  function displayPath(path) {
    if (!path) return "";
    return path
      .replace(/\[[^\]]+\]/g, "")
      .split(".")
      .map(humanize)
      .join(" > ");
  }

  function badge(text, kind) { return element("span", `badge ${kind}`, text); }

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function setCount(id, value) {
    view[id].textContent = Array.isArray(value) ? value.length : 0;
  }

  function hasValue(value) {
    return (
      value !== null
      && value !== undefined
      && value !== ""
      && (!Array.isArray(value) || value.length > 0)
    );
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function humanize(value) {
    return String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/^./, (letter) => letter.toUpperCase());
  }
  function isLongText(key, value) {
    return typeof value === "string" && (
      value.length > 90 || /description|summary|requirement|normalized_rule/.test(key)
    );
  }

  function showStatus(message, isError = false) {
    view.statusMessage.textContent = message;
    view.statusMessage.classList.toggle("error", isError);
    view.statusMessage.classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      view.statusMessage.classList.remove("visible");
    }, 2400);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildReviewArtifact,
      buildReviewedSimilarProjects,
      buildSimilarProjectReviewArtifact,
      buildSimilarProjectReviewDecisions,
      collectFunderSelectionErrors,
      collectSimilarProjectReviewErrors,
      detectReviewMode,
      isRequiredReviewField,
      itemsWithoutRelatedPath,
      normalizeBundle,
      pathsRelated,
    };
  }
})();
