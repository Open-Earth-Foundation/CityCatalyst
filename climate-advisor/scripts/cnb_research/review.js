(function () {
  "use strict";

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
  const NUMBER_KEYS = new Set([
    "weight", "min_award", "max_award", "award_amount", "award_year",
  ]);
  const MONEY_KEYS = new Set([
    "min_award", "max_award", "award_amount",
  ]);
  const BOOLEAN_KEYS = new Set(["hard_gate", "required", "is_opportunity"]);
  const SECTIONS = [
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

  const state = { bundle: null, fileName: null, fileHash: null, decisions: new Map() };
  const view = {};
  let statusTimer;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initialize);
  }

  function initialize() {
    [
      "bundleInput", "saveButton", "emptyState", "loadError", "workspace",
      "programName", "runMeta", "sourceCount", "evidenceCount", "gapCount",
      "conflictCount", "sectionNav", "reviewLayout", "selectionSummary",
      "editorSections", "inspectorPanel", "inspectorTitle", "inspectorPath",
      "inspectorContent", "reviewStatus", "reviewerName", "reviewNotes",
      "closeInspector", "statusMessage",
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
      const bundle = JSON.parse(text);
      validateBundle(bundle);
      state.bundle = bundle;
      state.fileName = file.name;
      state.fileHash = await sha256(text);
      state.decisions.clear();
      renderWorkspace();
      view.loadError.textContent = "";
      showStatus(`Loaded ${file.name}`);
    } catch (error) {
      view.loadError.textContent = `Could not load bundle: ${error.message}`;
    }
  }

  function validateBundle(bundle) {
    if (!bundle || typeof bundle !== "object") throw new Error("expected a JSON object");
    if (!bundle.run_id || !bundle.schema_version || !bundle.funder || !Array.isArray(bundle.funding_records)) {
      throw new Error("run_id, schema_version, funder, and funding_records are required");
    }
    if (bundle.funding_records.filter((record) => record.is_opportunity).length !== 1) {
      throw new Error("funding_records must contain exactly one opportunity");
    }
  }

  function renderWorkspace() {
    const { bundle } = state;
    view.emptyState.hidden = true;
    view.workspace.hidden = false;
    view.saveButton.disabled = false;
    const opportunity = bundle.funding_records.find((record) => record.is_opportunity);
    view.programName.textContent = opportunity?.name || "Unnamed program";
    view.runMeta.textContent = [
      bundle.funder.name,
      bundle.run_metadata?.model_name
        ? `Researched with ${bundle.run_metadata.model_name}`
        : null,
    ].filter(Boolean).join(" · ");
    setCount("sourceCount", bundle.sources);
    setCount("evidenceCount", bundle.evidence);
    setCount("gapCount", bundle.gaps);
    setCount("conflictCount", bundle.conflicts);
    view.reviewStatus.value = bundle.review?.status || "pending_review";
    view.reviewerName.value = bundle.review?.reviewer || "";
    view.reviewNotes.value = (bundle.review?.notes || []).join("\n");
    renderNavigation();
    renderSections();
    updateSelectionCount();
    showInspector();
  }

  function renderNavigation() {
    view.sectionNav.replaceChildren();
    SECTIONS.forEach(([id, title]) => {
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

  function renderSections() {
    view.editorSections.replaceChildren();
    SECTIONS.forEach(([id, title, description, keys]) => {
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
      keys.forEach((key) => {
        if (key in state.bundle) {
          renderValue(content, key, state.bundle[key], key, [key]);
        }
      });
      if (!content.children.length) content.append(element("p", "empty", "Nothing found."));
      section.append(summary, content);
      view.editorSections.append(section);
    });
    renderUnmappedReviewItems();
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

    const section = element("details", "editor-section review-issues");
    section.id = "other-review-issues";
    section.open = true;
    const summary = element("summary", "section-summary");
    const summaryText = element("span", "section-summary-text");
    summaryText.append(
      element("h2", "", "Needs follow-up"),
      element(
        "span",
        "section-description",
        "Useful facts the official sources did not establish.",
      ),
    );
    summary.append(summaryText, element("span", "collapse-label"));

    const content = element("div", "section-content");
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
    section.append(summary, content);
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
      renderValue(content, childKey, childValue, `${path}.${childKey}`, [...segments, childKey]);
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
      Object.entries(record).forEach(([childKey, childValue]) => {
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
    const decision = {
      target_path: path,
      segments,
      selected: hasValue(value),
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
    checkbox.setAttribute("aria-label", `Use ${humanize(key)}`);

    const label = element("div", "field-label", humanize(key));
    if (!hasValue(value)) label.append(element("span", "", "Not found"));

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
    if (!path) {
      return;
    }
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
      view.inspectorContent.append(element("p", "muted", "No field-level evidence or issue is mapped here."));
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

  function itemsWithoutRelatedPath(items, paths) {
    return items.filter(
      (item) => !paths.some((path) => pathsRelated(path, item.target_path)),
    );
  }

  function saveUpdate() {
    const update = buildUpdate();
    const fileName = `${state.bundle.run_id}.review-update.json`;
    const blob = new Blob([`${JSON.stringify(update, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showStatus(`Saved ${fileName}`);
  }

  function buildUpdate() {
    const decisions = visibleDecisions().map((decision) => ({
      target_path: decision.target_path,
      selected: decision.selected,
      original_value: decision.original_value,
      reviewed_value: decision.reviewed_value,
      evidence_refs: relatedItems("evidence", decision.target_path).map((item) => item.evidence_ref),
    }));
    const selected = decisions.filter((decision) => decision.selected).length;
    const now = new Date().toISOString();
    return {
      schema_version: "2.0",
      update_type: "cnb_funder_research_review",
      source_bundle: {
        run_id: state.bundle.run_id,
        schema_version: state.bundle.schema_version,
        file_name: state.fileName,
        sha256: state.fileHash,
        model_name: state.bundle.run_metadata?.model_name || null,
        prompt_sha256: state.bundle.run_metadata?.prompt_sha256 || null,
      },
      saved_at: now,
      review: {
        status: view.reviewStatus.value,
        reviewer: view.reviewerName.value.trim() || null,
        reviewed_at: now,
        notes: view.reviewNotes.value.split("\n").map((note) => note.trim()).filter(Boolean),
      },
      summary: {
        total_fields: decisions.length,
        selected_fields: selected,
        excluded_fields: decisions.length - selected,
        edited_fields: decisions.filter((item) => !equal(item.original_value, item.reviewed_value)).length,
      },
      decisions,
      reviewed_reference_data: buildReviewedReferenceData(),
    };
  }

  function buildReviewedReferenceData() {
    const result = {};
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
    if (Array.isArray(value)) return value.filter((item) => item !== undefined).map(removeArrayHoles);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removeArrayHoles(item)]));
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
    if (Array.isArray(original)) return raw.split("\n").map((item) => item.trim()).filter(Boolean);
    if (typeof original === "boolean" || BOOLEAN_KEYS.has(key)) return createControlValue(raw, "boolean");
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

  function updateSelectionCount() {
    const decisions = visibleDecisions();
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
      license_status: "Source reuse licence",
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
      .join(" › ");
  }

  function badge(text, kind) { return element("span", `badge ${kind}`, text); }

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function setCount(id, value) { view[id].textContent = Array.isArray(value) ? value.length : 0; }
  function hasValue(value) { return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function humanize(value) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()); }
  function isLongText(key, value) { return typeof value === "string" && (value.length > 90 || /description|summary|requirement|normalized_rule/.test(key)); }

  async function sha256(text) {
    if (!window.crypto?.subtle) return null;
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function showStatus(message) {
    view.statusMessage.textContent = message;
    view.statusMessage.classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => view.statusMessage.classList.remove("visible"), 2400);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { itemsWithoutRelatedPath, pathsRelated };
  }
})();
