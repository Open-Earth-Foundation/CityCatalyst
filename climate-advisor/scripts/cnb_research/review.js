(function () {
  "use strict";

  const support = typeof module !== "undefined" && module.exports
    ? require("./review-support.js")
    : window.CnbReviewSupport;
  const {
    REFERENCE_DATA_MODE,
    SIMILAR_PROJECT_MODE,
    buildReviewUpdate,
    buildReviewedSimilarProjects,
    collectFunderSelectionErrors,
    collectSimilarProjectReviewErrors,
    detectReviewMode,
    isRequiredReviewField,
    itemsWithoutRelatedPath,
    pathsRelated,
    validateBundle,
  } = support;

  const state = {
    bundle: null,
    mode: REFERENCE_DATA_MODE,
    decisions: new Map(),
  };
  const view = {};
  let renderer;
  let statusTimer;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initialize);
  }

  function initialize() {
    [
      "bundleInput", "saveButton", "pageTitle", "emptyState", "loadError",
      "workspace", "programName", "runMeta", "sourceCount", "evidenceCount",
      "gapCount", "conflictCount", "countLabel1", "countLabel2", "countLabel3",
      "countLabel4", "sectionNav", "reviewLayout", "selectionSummary",
      "editorSections", "inspectorPanel", "inspectorTitle", "inspectorPath",
      "inspectorContent", "reviewStatus", "reviewerName", "reviewNotes",
      "closeInspector", "statusMessage",
    ].forEach((id) => {
      view[id] = document.getElementById(id);
    });

    renderer = window.CnbReviewRenderer.createReviewRenderer(state, view);
    view.bundleInput.addEventListener("change", handleBundleSelection);
    view.saveButton.addEventListener("click", saveUpdate);
    view.closeInspector.addEventListener("click", () => renderer.showInspector());
  }

  function handleBundleSelection(event) {
    const file = event.target.files[0];
    if (file) loadBundle(file);
    event.target.value = "";
  }

  async function loadBundle(file) {
    try {
      const bundle = JSON.parse(await file.text());
      const mode = detectReviewMode(bundle);
      validateBundle(bundle, mode);
      state.bundle = bundle;
      state.mode = mode;
      state.decisions.clear();
      renderer.renderWorkspace();
      view.loadError.textContent = "";
      showStatus(`Loaded ${file.name}`);
    } catch (error) {
      view.loadError.textContent = `Could not load research JSON: ${error.message}`;
    }
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
      notes: view.reviewNotes.value
        .split("\n")
        .map((note) => note.trim())
        .filter(Boolean),
    };
    return buildReviewUpdate({
      bundle: state.bundle,
      mode: state.mode,
      decisions: state.decisions,
      review,
      savedAt: now,
    });
  }

  function showStatus(message, isError = false) {
    view.statusMessage.textContent = message;
    view.statusMessage.classList.toggle("error", isError);
    view.statusMessage.classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(
      () => view.statusMessage.classList.remove("visible"),
      2400,
    );
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildReviewedSimilarProjects,
      collectFunderSelectionErrors,
      collectSimilarProjectReviewErrors,
      detectReviewMode,
      isRequiredReviewField,
      itemsWithoutRelatedPath,
      pathsRelated,
    };
  }
})();
