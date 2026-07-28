(function () {
  "use strict";

  const REFERENCE_DATA_MODE = "reference_data";
  const SIMILAR_PROJECT_MODE = "similar_projects";
  const REFERENCE_DATA_UPDATE_TYPE = "cnb_reference_data_review";
  const SIMILAR_PROJECT_UPDATE_TYPE = "cnb_similar_project_review";

  const NUMBER_KEYS = new Set([
    "weight", "min_award", "max_award", "award_amount", "award_year",
  ]);
  const MONEY_KEYS = new Set([
    "min_award", "max_award", "award_amount",
  ]);
  const BOOLEAN_KEYS = new Set(["hard_gate", "required", "is_opportunity"]);

  function detectReviewMode(bundle) {
    return bundle?.artifact_type === "cnb_similar_project_search"
      ? SIMILAR_PROJECT_MODE
      : REFERENCE_DATA_MODE;
  }

  function validateBundle(bundle, mode) {
    if (!bundle || typeof bundle !== "object") {
      throw new Error("expected a JSON object");
    }
    if (!bundle.run_id || !bundle.schema_version) {
      throw new Error("run_id and schema_version are required");
    }
    if (mode === SIMILAR_PROJECT_MODE) {
      validateSimilarProjectBundle(bundle);
      return;
    }
    validateReferenceDataBundle(bundle);
  }

  function validateSimilarProjectBundle(bundle) {
    if (!bundle.search_request || !Array.isArray(bundle.candidates) || !bundle.result) {
      throw new Error(
        "search_request, candidates, and result are required for similar-project review",
      );
    }
    if (
      !Array.isArray(bundle.sources)
      || !Array.isArray(bundle.result.matches)
      || !Array.isArray(bundle.result.caveats)
    ) {
      throw new Error("sources, result.matches, and result.caveats are required");
    }
  }

  function validateReferenceDataBundle(bundle) {
    if (!bundle.funder || !Array.isArray(bundle.funding_records)) {
      throw new Error("funder and funding_records are required");
    }
    const opportunities = bundle.funding_records.filter((record) => record.is_opportunity);
    if (opportunities.length !== 1) {
      throw new Error("funding_records must contain exactly one opportunity");
    }
  }

  function relatedItems(bundle, collection, path) {
    return (bundle?.[collection] || []).filter(
      (item) => pathsRelated(path, item.target_path),
    );
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

  function buildReviewUpdate({ bundle, mode, decisions, review, savedAt }) {
    const update = {
      run_id: bundle.run_id,
      schema_version: bundle.schema_version,
      saved_at: savedAt,
      review,
    };
    if (mode === SIMILAR_PROJECT_MODE) {
      const errors = collectSimilarProjectReviewErrors(bundle, decisions);
      if (errors.length) throw new Error(errors.join(" "));
      return {
        ...update,
        update_type: SIMILAR_PROJECT_UPDATE_TYPE,
        decisions: serializeDecisions(bundle, decisions),
        reviewed_similar_projects: buildReviewedSimilarProjects(bundle, decisions),
      };
    }

    if (review.status === "approved") {
      const errors = collectFunderSelectionErrors(bundle, decisions);
      if (errors.length) throw new Error(errors.join(" "));
    }
    return {
      ...update,
      update_type: REFERENCE_DATA_UPDATE_TYPE,
      decisions: serializeDecisions(bundle, decisions),
      reviewed_reference_data: buildReviewedReferenceData(decisions),
    };
  }

  function serializeDecisions(bundle, decisions) {
    return visibleDecisions(decisions).map((decision) => ({
      target_path: decision.target_path,
      selected: decision.selected,
      original_value: decision.original_value,
      reviewed_value: decision.reviewed_value,
      evidence_refs: decision.evidence_refs
        || relatedItems(bundle, "evidence", decision.target_path)
          .map((item) => item.evidence_ref),
    }));
  }

  function buildReviewedSimilarProjects(bundle, decisions) {
    const matches = (bundle.result.matches || [])
      .map((match) => {
        const matchPath = `result.matches[${match.funding_record_id}]`;
        if (decisions.get(matchPath)?.selected === false) return null;
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
        ?? match.fit_rationale,
      ),
      matched_tags: clone(
        decisions.get(`result.matches[${matchId}].matched_tags`)?.reviewed_value
        ?? match.matched_tags,
      ),
      evidence: clone(match.evidence || []),
      caveats: clone(
        decisions.get(`result.matches[${matchId}].caveats`)?.reviewed_value
        ?? match.caveats,
      ),
    };
  }

  function collectFunderSelectionErrors(bundle, decisions) {
    const errors = [];
    (bundle?.funding_records || []).forEach((record) => {
      if (record.is_opportunity) return;
      const path = `funding_records[${record.funding_record_ref}].selected_funder_id`;
      const decision = decisions.get(path);
      const selectedFunderId = decision?.reviewed_value
        ? String(decision.reviewed_value)
        : "";
      const candidateIds = new Set(
        (record.candidate_funders || []).map(
          (candidate) => String(candidate.funder_id),
        ),
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

  function buildReviewedReferenceData(decisions) {
    const result = { funder: { profile: {} } };
    [...decisions.values()]
      .filter((item) => item.selected)
      .forEach((item) => setNestedValue(result, item.segments, item.reviewed_value));
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
        Object.entries(value).map(
          ([key, item]) => [key, removeArrayHoles(item)],
        ),
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

  function recordTitle(key, record, index) {
    return record.name
      || record.title
      || record.label
      || record.template_name
      || `${humanize(key).replace(/s$/, "")} ${index + 1}`;
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

  function isReferenceKey(key) {
    return key.endsWith("_ref")
      || key.endsWith("_reference")
      || key === "is_opportunity";
  }

  function displayPath(path) {
    if (!path) return "";
    return path
      .replace(/\[[^\]]+\]/g, "")
      .split(".")
      .map(humanize)
      .join(" > ");
  }

  function hasValue(value) {
    return value !== null
      && value !== undefined
      && value !== ""
      && (!Array.isArray(value) || value.length > 0);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function humanize(value) {
    return String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  function isLongText(key, value) {
    return typeof value === "string"
      && (
        value.length > 90
        || /description|summary|requirement|normalized_rule/.test(key)
      );
  }

  function visibleDecisions(decisions) {
    return [...decisions.values()].filter((item) => !item.internal);
  }

  const api = {
    BOOLEAN_KEYS,
    MONEY_KEYS,
    NUMBER_KEYS,
    REFERENCE_DATA_MODE,
    SIMILAR_PROJECT_MODE,
    buildReviewUpdate,
    buildReviewedSimilarProjects,
    clone,
    collectFunderSelectionErrors,
    collectSimilarProjectReviewErrors,
    detectReviewMode,
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
    pathsRelated,
    recordTitle,
    relatedItems,
    validateBundle,
    visibleDecisions,
  };

  if (typeof window !== "undefined") window.CnbReviewSupport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
