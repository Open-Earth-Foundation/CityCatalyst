(function () {
  "use strict";

  // Render the single local review workspace from caller-owned state and DOM nodes.

  const support = typeof module !== "undefined" && module.exports
    ? require("./review-support.js")
    : window.CnbReviewSupport;
  const {
    BOOLEAN_KEYS,
    MONEY_KEYS,
    NUMBER_KEYS,
    SIMILAR_PROJECT_MODE,
    clone,
    displayPath,
    formatValue,
    hasValue,
    humanize,
    isLongText,
    isReferenceKey,
    isRequiredReviewField,
    issueTitle,
    itemsWithoutRelatedPath,
    parseValue,
    recordTitle,
    relatedItems: findRelatedItems,
    visibleDecisions: findVisibleDecisions,
  } = support;

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
    ["current-project", "Current project", "Fields used for similar-project search."],
    ["selected-matches", "Selected matches", "Candidate context, evidence, and review."],
    ["result-caveats", "Result caveats", "Caveats retained with the result."],
  ];
  let state;
  let view;

  function createReviewRenderer(reviewState, reviewView) {
    state = reviewState;
    view = reviewView;
    return { renderWorkspace, showInspector };
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
    const similar = mode === SIMILAR_PROJECT_MODE;
    view.pageTitle.textContent = similar ? "Similar project review" : "Research review";
    view.saveButton.textContent = similar ? "Save similar-project review" : "Save review";
    const labels = similar
      ? ["Candidates", "Matches", "Evidence", "Caveats"]
      : ["Sources", "Evidence", "Gaps", "Conflicts"];
    labels.forEach((label, index) => {
      view[`countLabel${index + 1}`].textContent = label;
    });
    view.sectionNav.setAttribute("aria-label", `${view.pageTitle.textContent} sections`);
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
    REFERENCE_DATA_SECTIONS.forEach((definition) => {
      const keys = definition[3];
      appendSection(definition, (content) => {
        keys.forEach((key) => {
          if (key in state.bundle) {
            renderValue(content, key, state.bundle[key], key, [key]);
          }
        });
      });
    });
    renderUnmappedReviewItems();
  }

  function renderSimilarProjectSections() {
    view.editorSections.replaceChildren();
    const request = state.bundle.search_request;
    appendSection(SIMILAR_PROJECT_SECTIONS[0], (content) => {
      const grid = element("div", "readonly-grid");
      Object.entries(request).forEach(([key, value]) => {
        if (!hasValue(value) || ["run_id", "limit"].includes(key)) return;
        const card = element("article", "readonly-card");
        const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
        card.append(element("h3", "", humanize(key)), element("p", "", displayValue));
        grid.append(card);
      });
      content.append(grid);
    });
    appendSection(SIMILAR_PROJECT_SECTIONS[1], (content) => {
      state.bundle.result.matches.forEach((match, index) => {
        content.append(createMatchCard(match, index));
      });
    });
    appendSection(SIMILAR_PROJECT_SECTIONS[2], (content) => {
      content.append(createEditableRow({
        key: "caveats",
        label: "Result caveats",
        value: state.bundle.result.caveats,
        path: "result.caveats",
        segments: ["result", "caveats"],
        note: "One caveat per line.",
      }));
    });
  }

  function createMatchCard(match, index) {
    const candidate = candidateForMatch(match);
    const path = `result.matches[${match.funding_record_id}]`;
    state.decisions.set(path, {
      target_path: path,
      selected: true,
      original_value: clone(match),
      reviewed_value: clone(match),
      evidence_refs: (match.evidence || []).map((item) => item.evidence_ref),
    });

    const { group, content } = disclosureGroup(
      "record",
      candidate?.name || `Match ${index + 1}`,
    );
    const header = element("div", "match-review-header");
    const toggle = element("label", "match-toggle");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    const meta = [
      candidate?.applicant_name,
      [candidate?.city, candidate?.state_region, candidate?.country].filter(Boolean).join(", "),
      [
        candidate?.award_amount,
        candidate?.currency,
        candidate?.award_year,
      ].filter(Boolean).join(" "),
    ].filter(Boolean).join(" | ");
    const copy = element("div");
    copy.append(element("strong", "", candidate?.name || "Selected match"));
    if (meta) copy.append(element("p", "", meta));
    toggle.append(checkbox, copy);
    header.append(toggle);
    [[match.evidence?.length, "evidence", "evidence"],
      [match.matched_tags?.length, "matched tags", "gap"],
      [match.caveats?.length, "caveats", "conflict"]]
      .filter(([count]) => count)
      .forEach(([count, text, kind]) => header.append(badge(`${count} ${text}`, kind)));

    const summary = element("article", "candidate-summary");
    if (candidate) {
      const facts = [
        [candidate.funder_name, candidate.category, candidate.sector, candidate.region_scope]
          .filter(Boolean).join(" | "),
        candidate.summary,
        listFact("Hazards", candidate.hazards),
        listFact("Interventions", candidate.interventions),
        listFact("Project tags", candidate.project_tags),
        listFact("Known gaps", candidate.known_gaps),
      ].filter(Boolean);
      facts.forEach((fact) => summary.append(element("p", "", fact)));
    } else {
      summary.append(element("p", "", "Candidate display data was not supplied."));
    }
    const rows = [
      createSimilarFieldRow(match, "fit_rationale", "Fit rationale", "Why this match helps."),
      createSimilarFieldRow(match, "matched_tags", "Matched tags", "One tag per line."),
      createSimilarFieldRow(match, "caveats", "Caveats", "One caveat per line."),
    ];
    checkbox.addEventListener("change", () => {
      state.decisions.get(path).selected = checkbox.checked;
      ["fit_rationale", "matched_tags", "caveats"].forEach((field) => {
        state.decisions.get(`${path}.${field}`).selected = checkbox.checked;
      });
      [header, ...rows].forEach((row) => row.classList.toggle("excluded", !checkbox.checked));
      rows.forEach((row) => row.querySelectorAll("input, textarea, select")
        .forEach((control) => { control.disabled = !checkbox.checked; }));
      updateSelectionCount();
    });
    content.append(header, summary);
    (match.evidence || []).forEach((item) => content.append(evidenceItem(item)));
    content.append(...rows);
    return group;
  }

  function createSimilarFieldRow(match, key, label, note) {
    const value = match[key] ?? (key === "fit_rationale" ? "" : []);
    const path = `result.matches[${match.funding_record_id}].${key}`;
    const row = createEditableRow({
      key,
      label,
      value,
      path,
      segments: ["result", "matches", String(match.funding_record_id), key],
      note,
      badges: [
        [(match.evidence || []).length, "evidence", "evidence"],
        [key === "caveats" ? 0 : (match.caveats || []).length, "caveats", "conflict"],
      ],
      evidenceRefs: (match.evidence || []).map((item) => item.evidence_ref),
    });
    row.dataset.parentMatch = `result.matches[${match.funding_record_id}]`;
    return row;
  }

  function listFact(label, values) {
    return values?.length ? `${label}: ${values.join(", ")}` : "";
  }

  function candidateForMatch(match) {
    const targetId = String(match?.funding_record_id);
    return state.bundle.candidates.find(
      (candidate) => String(candidate.funding_record_id) === targetId,
    ) || null;
  }

  function appendSection(definition, renderContent) {
    const section = createSection(...definition);
    const content = section.querySelector(".section-content");
    renderContent(content);
    if (!content.children.length) content.append(element("p", "empty", "Nothing found."));
    view.editorSections.append(section);
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
      option.textContent = candidate.match_reason
        ? `${candidate.name} - ${candidate.match_reason}`
        : candidate.name;
      select.append(option);
    });
    select.value = decision.reviewed_value ? String(decision.reviewed_value) : "";
    select.addEventListener("focus", () => {
      showInspector("reported_funder_name", `${recordPath}.reported_funder_name`);
    });
    select.addEventListener("change", () => {
      decision.reviewed_value = select.value || null;
    });

    controlBox.append(select);
    if (!record.candidate_funders?.length) {
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
    return createEditableRow({
      key: "project_tags",
      label: "Project tags",
      value: record.project_tags || [],
      path,
      segments,
      note: "One tag per line. Reviewer-curated only.",
      inspect: () => showInspector("project_tags", path),
    });
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
    const evidence = relatedItems("evidence", path);
    const gaps = relatedItems("gaps", path);
    const conflicts = relatedItems("conflicts", path);
    return createEditableRow({
      key,
      label: humanize(key),
      value,
      path,
      segments,
      selected: required || hasValue(value),
      required,
      showToggle: true,
      note: !hasValue(value) ? "Not found" : required ? "Required for import." : "",
      warning: gaps.length > 0 || conflicts.length > 0,
      inspect: () => showInspector(key, path),
      badges: [
        [evidence.length, "evidence", "evidence"],
        [gaps.length, "gap", "gap"],
        [conflicts.length, "conflict", "conflict"],
      ],
    });
  }

  function createEditableRow(options) {
    const {
      key,
      label,
      value,
      path,
      segments,
      selected = true,
      required = false,
      showToggle = false,
      note = "",
      warning = false,
      inspect,
      badges = [],
      evidenceRefs = null,
    } = options;
    const decision = {
      target_path: path,
      segments,
      selected,
      original_value: clone(value),
      reviewed_value: clone(value),
      evidence_refs: evidenceRefs,
    };
    state.decisions.set(path, decision);

    const row = element("div", "field-row");
    if (!decision.selected) row.classList.add("excluded");
    if (warning) row.classList.add("warning");

    const checkbox = document.createElement(showToggle ? "input" : "div");
    if (showToggle) {
      checkbox.type = "checkbox";
      checkbox.checked = decision.selected;
      checkbox.disabled = required;
      checkbox.setAttribute("aria-label", `Use ${label}`);
    }

    const labelNode = element("div", "field-label", label);
    if (note) labelNode.append(element("span", "field-note", note));

    const controlBox = element("div", "field-control");
    const control = createControl(key, value);
    control.value = formatValue(key, value);
    control.disabled = !decision.selected;
    control.setAttribute("aria-label", label);
    if (inspect) {
      row.addEventListener("click", inspect);
      control.addEventListener("focus", inspect);
    }
    control.addEventListener("input", () => {
      decision.reviewed_value = parseValue(key, value, control.value);
    });
    if (MONEY_KEYS.has(key)) {
      control.addEventListener("blur", () => {
        control.value = formatValue(key, decision.reviewed_value);
      });
    }
    if (showToggle) {
      checkbox.addEventListener("change", () => {
        decision.selected = checkbox.checked;
        control.disabled = !checkbox.checked;
        row.classList.toggle("excluded", !checkbox.checked);
        updateSelectionCount();
        if (inspect) inspect();
      });
    }

    const badgeBox = element("div", "badges");
    badges.filter(([count]) => count).forEach(([count, text, kind]) => {
      badgeBox.append(badge(`${count} ${text}`, kind));
    });
    controlBox.append(control, badgeBox);
    row.append(checkbox, labelNode, controlBox);
    return row;
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
        element("p", "muted", "No evidence or issue is mapped here."),
      );
    }
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
    return findRelatedItems(state.bundle, collection, path);
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

  function visibleDecisions() {
    return findVisibleDecisions(state.decisions);
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

  const api = { createReviewRenderer };
  if (typeof window !== "undefined") window.CnbReviewRenderer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
