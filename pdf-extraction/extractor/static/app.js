/* Standalone document upload, job polling, and evidence review. No browser API keys. */
"use strict";

const $ = (id) => document.getElementById(id);
const exampleSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    city: { type: ["string", "null"], description: "Name of the city in the report" },
    reporting_year: { type: ["integer", "null"], description: "Year of the reported data" },
    electricity_mwh: { type: ["number", "null"], description: "Annual electricity consumption in MWh. Do not substitute other energy sources." },
  },
  required: ["city", "reporting_year", "electricity_mwh"],
  additionalProperties: false,
};
const state = { config: null, busy: false, job: null, result: null, debug: null, timer: null, reportURL: null, evidenceURL: null, sample: false, generation: 0, benchmark: null };
$("schema-editor").value = JSON.stringify(exampleSchema, null, 2);

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

function mode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function setBusy(busy) {
  state.busy = busy;
  $("run").disabled = busy || !state.config?.ready;
  $("sample").disabled = busy;
  $("resume-job").disabled = busy || !state.config?.ready;
  $("report-file").disabled = busy;
  $("taxonomy-file").disabled = busy;
  $("schema-editor").disabled = busy;
  $("schema-file").disabled = busy;
  $("format-schema").disabled = busy;
  $("report-label").disabled = busy;
  $("mistral-ocr").disabled = busy || !state.config?.mistral_ocr_ready;
  $("auto-repair").disabled = busy;
  $("max-repairs").disabled = busy || !$("auto-repair").checked;
  for (const id of ["refresh-benchmarks", "benchmark-case", "load-benchmark", "clear-benchmark"]) $(id).disabled = busy;
  for (const id of ["system-prompt", "user-prompt", "save-prompts", "reset-prompts"]) $(id).disabled = busy;
  document.querySelectorAll('input[name="mode"]').forEach((input) => { input.disabled = busy; });
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = $("service-token").value;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg).join("; ") : data.detail;
    throw new Error(detail || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

function recordJob(id) {
  state.job = id;
  $("job-id").textContent = id;
  $("resume-id").value = id;
  try { sessionStorage.setItem("document-lab-job", id); } catch { /* Storage may be disabled. */ }
}

function stopPolling() {
  state.generation += 1;
  clearTimeout(state.timer);
  state.timer = null;
}

function showJob(status, message) {
  $("empty-state").hidden = true;
  $("job-panel").hidden = false;
  $("job-status").textContent = status.replaceAll("_", " ");
  $("job-message").textContent = message;
}

async function poll(generation) {
  if (generation !== state.generation || !state.job) return;
  const id = state.job;
  try {
    const job = await api(`/v1/extractions/${encodeURIComponent(id)}`);
    if (generation !== state.generation) return;
    const messages = {
      queued: "Preparing the agent workspace and input documents. You can return to this job using its ID.",
      running: "The agent is reading the report, extracting fields, and checking source evidence. Long reports can take several minutes.",
      validating: "Checking the completed candidate against the output contract, schema, and page bounds…",
      repairing: "Validation issues were sent back to the same agent. It is checking the source and repairing the candidate…",
      cancellation_requested: "Waiting for the agent to stop. Further repair is disabled.",
      repair_error: "The repair loop stopped after an error. Review the activity log and any saved candidate.",
      completed: "The agent has finished. Loading and validating its result…",
      failed: "The extraction failed. Inspect the session in your OpenAI project logs. You can cancel or start a new extraction.",
      cancelled: "The agent has stopped. You can start a new extraction.",
      needs_input: "The agent needs attention. Inspect the session in your OpenAI project logs, or cancel this job.",
    };
    showJob(job.status, messages[job.status] || "Checking job status…");
    renderProgress(job);
    try {
      const activity = await api(`/v1/extractions/${encodeURIComponent(id)}/activity`, { signal: AbortSignal.timeout(10000) });
      if (generation !== state.generation) return;
      state.debug = { ...activity, controller: job };
      renderActivity(activity);
      $("activity-error").textContent = "";
    } catch (error) {
      if (generation !== state.generation) return;
      state.debug = { controller: job };
      $("activity-error").textContent = `Tool activity unavailable: ${error.message} Job progress continues.`;
    }
    $("download-debug").disabled = false;
    if (["completed", "repair_error"].includes(job.status)) {
      const result = await api(`/v1/extractions/${encodeURIComponent(id)}/result`);
      if (generation !== state.generation) return;
      renderResult(result, false);
      showJob(job.status, job.status === "repair_error" ? "The repair loop stopped after an error. Review the log and any saved candidate." : job.repair_outcome === "limit_reached" ? "Repair limit reached. Review the remaining issues and candidate evidence." : "Checks finished. Review candidate evidence and any unresolved issues.");
      $("cancel").hidden = true;
      setBusy(false);
      return;
    }
    if (["failed", "cancelled", "needs_input"].includes(job.status)) {
      $("cancel").hidden = job.status !== "needs_input";
      setBusy(false);
      return;
    }
    state.timer = setTimeout(() => poll(generation), 3000);
  } catch (error) {
    if (generation !== state.generation) return;
    setBusy(false);
    showError(`${error.message} Polling has paused. Your job may still be running; save its ID and use Resume to check again.`);
  }
}

function startPolling(id, evidenceURL = null) {
  stopPolling();
  state.evidenceURL = evidenceURL;
  recordJob(id);
  setBusy(true);
  $("results").hidden = true;
  state.debug = null;
  $("download-debug").disabled = true;
  $("activity-error").textContent = "";
  $("loop-summary").textContent = "Loading controller progress…";
  $("usage").textContent = "";
  $("activity-panel").hidden = false;
  $("agent-log").replaceChildren();
  $("controller-log").replaceChildren();
  $("cancel").hidden = false;
  showJob("submitted", "Your documents have been submitted. Checking the hosted agent…");
  poll(state.generation);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function openPage(page) {
  if (state.evidenceURL && !state.sample) window.open(`${state.evidenceURL}#page=${page}`, "_blank", "noopener,noreferrer");
}

function renderResult(envelope, sample) {
  state.result = envelope;
  state.sample = sample;
  const result = envelope.result || { fields: [], city: "No valid candidate available", warnings: ["The agent output could not be read as a valid result. Review validation issues in the debug log."] };
  const fields = result.fields || [];
  $("empty-state").hidden = true;
  $("results").hidden = false;
  $("sample-notice").hidden = !sample;
  $("result-count").textContent = `${fields.filter((field) => field.status === "found").length} / ${fields.length} fields found`;
  $("result-caption").textContent = sample ? "Illustrative output · not a live extraction" : result.city + (envelope.preprocessing?.ocr_provider === "mistral" ? " · Mistral OCR" : "");
  const validation = envelope.validation || {};
  const score = envelope.benchmark;
  $("benchmark-score").hidden = !score;
  $("benchmark-score").classList.toggle("issue", score?.status !== "passed");
  $("benchmark-score").replaceChildren();
  if (score) {
    $("benchmark-score").append(element("strong", "", `${score.case_id}: ${score.status}${score.total ? ` · ${score.passed}/${score.total} expected checks passed` : ""}`));
    $("benchmark-score").append(element("p", "", score.reason || score.note || ""));
    const list = element("ul");
    for (const check of (score.checks || []).filter((check) => !check.passed)) list.append(element("li", "", `${check.label || check.path || JSON.stringify(check.row)}: expected ${JSON.stringify(Object.hasOwn(check, "value") ? check.value : check.notation)}, observed ${JSON.stringify(check.actual)}`));
    $("benchmark-score").append(list);
  }
  $("validation").classList.toggle("issue", !envelope.result || validation.data_schema === "failed" || !!envelope.repair?.issues?.length);
  $("validation").textContent = !envelope.result ? "The result failed validation. Issues are shown below; no valid candidate is available." : validation.data_schema === "failed" ? "Some data does not match your JSON Schema. Partial results are shown below." : validation.data_schema === "passed" ? "Data matches your JSON Schema. Source accuracy still needs review." : "Result structure and page bounds checked. Review the source and taxonomy mapping.";
  const warnings = [...new Set([...(result.warnings || []), ...(validation.warnings || []), ...(validation.data_schema_errors || []), ...(envelope.repair?.issues || [])])];
  $("warnings").replaceChildren();
  $("warnings").hidden = warnings.length === 0;
  if (warnings.length) {
    $("warnings").append(element("strong", "", "Review notes"));
    const list = element("ul");
    warnings.forEach((warning) => list.append(element("li", "", warning)));
    $("warnings").append(list);
  }
  const labels = new Map((result.taxonomy || []).map((field) => [field.id, field.label]));
  $("field-list").replaceChildren();
  fields.forEach((field) => {
    const card = element("article", "field-result");
    const top = element("div", "field-top");
    const label = labels.get(field.field_id) || field.field_id.split("/").at(-1).replaceAll("~1", "/").replaceAll("~0", "~").replaceAll("_", " ");
    top.append(element("h3", "field-title", label));
    top.append(element("span", `field-status${field.status === "found" ? "" : " unresolved"}`, field.status.replaceAll("_", " ")));
    card.append(top, element("div", "field-path", field.field_id));
    (field.observations || []).forEach((observation) => {
      const block = element("div", "observation");
      const value = element("div", "observation-value", observation.value);
      if (observation.unit) value.append(element("span", "observation-unit", observation.unit));
      block.append(value);
      const meta = [observation.year, observation.geography].filter(Boolean);
      if (meta.length) block.append(element("div", "observation-meta", meta.join(" · ")));
      (observation.evidence || []).forEach((evidence) => {
        const quote = element("blockquote", "evidence");
        const link = element("button", "", `PDF page ${evidence.pdf_page}${evidence.printed_page ? ` · printed ${evidence.printed_page}` : ""}${state.evidenceURL && !sample ? " ↗" : ""}`);
        link.type = "button";
        link.disabled = !state.evidenceURL || sample;
        link.addEventListener("click", () => openPage(evidence.pdf_page));
        quote.append(link, element("p", "", evidence.quote));
        block.append(quote);
      });
      (observation.notes || []).forEach((note) => block.append(element("p", "field-explanation", note)));
      card.append(block);
    });
    card.append(element("p", "field-explanation", field.explanation));
    $("field-list").append(card);
  });
  $("json-output").textContent = JSON.stringify(envelope, null, 2);
  switchTab("evidence");
}

function renderProgress(job) {
  $("activity-panel").hidden = false;
  $("loop-summary").textContent = `${job.auto_repair ? "Automatic repair on" : "Flag issues only"} · ${job.repairs || 0} / ${job.max_repairs || 0} repair turns · ${job.turn_id || "Waiting for a turn"}${job.repair_outcome ? " · " + job.repair_outcome.replaceAll("_", " ") : ""}`;
  $("usage").textContent = job.usage ? `Reported session usage: ${JSON.stringify(job.usage)}` : "Usage has not been reported yet.";
  if (job.repair_still_needed != null) $("loop-summary").textContent += ` · ${job.remaining_issue_count || 0} remaining issues · ${job.repair_still_needed ? "further review/repair needed" : "automated checks passed"}`;
  $("controller-log").replaceChildren();
  for (const event of job.history || []) {
    const entry = element("li", "", `${new Date(event.time).toLocaleTimeString()} · ${event.type.replaceAll("_", " ")}${event.attempt ? ` · repair ${event.attempt}` : ""} — ${event.message}`);
    if (event.issues?.length) entry.append(element("pre", "", event.issues.join("\n")));
    if (event.resolved_issue_count != null) entry.append(element("p", "helper small", `${event.resolved_issue_count} issues resolved · ${event.new_issue_count || 0} new issues · ${event.changed_data_paths?.length || 0} data paths changed`));
    $("controller-log").append(entry);
  }
  if (job.error) $("controller-log").append(element("li", "", job.error));
}

function renderActivity(activity) {
  const log = $("agent-log");
  // Preserve expanded tool entries across polls.
  const expanded = new Set([...log.querySelectorAll("details[open]")].map((node) => node.dataset.id));
  log.replaceChildren();
  for (const item of activity.items || []) {
    const entry = element("details", "tool-entry");
    entry.dataset.id = item.id;
    entry.open = expanded.has(item.id) || item.status === "in_progress";
    entry.append(element("summary", "", `${item.type.replaceAll("_", " ")} · ${item.status || item.phase || "message"}${item.exit_code != null ? ` · exit ${item.exit_code}` : ""}`));
    entry.append(element("p", "helper small", `Turn ${item.turn_id || "unknown"} · ${item.id}${item.duration_ms != null ? ` · ${item.duration_ms} ms` : ""}`));
    entry.append(element("pre", "", [item.command, item.text, item.output, item.name].filter(Boolean).join("\n")));
    log.append(entry);
  }
  if (!activity.items?.length) log.append(element("p", "helper small", "Waiting for public agent messages or tool records…"));
  if (activity.has_older_items) log.append(element("p", "helper small", "Older session items are omitted from this view."));
}

$("auto-repair").addEventListener("change", () => { $("max-repairs").disabled = state.busy || !$("auto-repair").checked; });
$("download-debug").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state.debug, null, 2)], { type: "application/json" }));
  const link = element("a"); link.href = url; link.download = `${state.job || "job"}-debug.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function switchTab(tab) {
  ["evidence", "json"].forEach((name) => {
    $(`${name}-tab`).setAttribute("aria-selected", String(name === tab));
    $(`${name}-tab`).tabIndex = name === tab ? 0 : -1;
    $(`${name}-view`).hidden = name !== tab;
  });
}

function selectFile(kind) {
  const file = $(`${kind}-file`).files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 45 * 1024 * 1024) {
    $(`${kind}-file`).value = "";
    showError("Choose a PDF file of 45 MiB or smaller.");
    return;
  }
  $(`${kind}-name`).textContent = file.name;
  $(`${kind}-meta`).textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MiB · click to replace`;
  if (kind === "report") {
    clearBenchmark();
    state.evidenceURL = null;
    if (state.result && !state.sample) {
      state.result = null;
      $("results").hidden = true;
      $("empty-state").hidden = false;
    }
    if (state.reportURL) URL.revokeObjectURL(state.reportURL);
    state.reportURL = URL.createObjectURL(file);
    $("preview-report").hidden = false;
  }
  showError("");
}

function clearBenchmark() {
  state.benchmark = null;
  $("benchmark-status").textContent = "Test mode cleared. You can upload a report or load another test case.";
}

$("clear-benchmark").addEventListener("click", clearBenchmark);
$("refresh-benchmarks").addEventListener("click", async () => {
  try {
    const data = await api("/v1/benchmarks");
    $("benchmark-case").replaceChildren();
    for (const group of ["fixture", "public", "real"]) {
      const optgroup = element("optgroup");
      optgroup.label = { fixture: "Synthetic checks", public: "Real city reports · public downloads", real: "Canonical GHGI benchmark · Product keys" }[group];
      for (const test of data.cases.filter((test) => test.group === group)) {
        const option = element("option", "", `${test.label}${!test.pdf_ready ? " · PDF missing" : !test.answers_ready ? " · no answer key" : " · ready"}`);
        option.value = test.id; optgroup.append(option);
      }
      $("benchmark-case").append(optgroup);
    }
    $("benchmark-status").textContent = `${data.cases.filter((test) => test.pdf_ready).length} of ${data.cases.length} PDFs installed. Missing originals can be imported with the preparation command.`;
  } catch (error) { showError(error.message); }
});
$("load-benchmark").addEventListener("click", async () => {
  const id = $("benchmark-case").value;
  if (!id) return;
  setBusy(true);
  showError("");
  try {
    const test = await api(`/v1/benchmarks/${encodeURIComponent(id)}`);
    if (!test.pdf_ready) throw new Error("This PDF is not installed. Import the original files using examples.prepare_benchmarks; see benchmarks/README.md.");
    const headers = {};
    if ($("service-token").value) headers.Authorization = `Bearer ${$("service-token").value}`;
    const response = await fetch(`/v1/benchmarks/${encodeURIComponent(id)}/pdf`, { headers });
    if (!response.ok) throw new Error(`Could not load benchmark PDF (HTTP ${response.status}).`);
    const files = new DataTransfer();
    files.items.add(new File([await response.blob()], `${id}.pdf`, { type: "application/pdf" }));
    $("report-file").files = files.files;
    selectFile("report");
    document.querySelector('input[name="mode"][value="json_schema"]').checked = true;
    $("json-mode").hidden = false; $("pdf-mode").hidden = true;
    $("schema-editor").value = JSON.stringify(test.data_schema, null, 2);
    $("report-label").value = test.report_label;
    $("user-prompt").value = test.user_prompt;
    state.benchmark = id;
    $("benchmark-status").textContent = `Loaded ${test.label}. ${test.answers_ready ? "Expected checks will run after extraction." : "No answer key: manual review only."} Choose OCR/repair, then Extract data.`;
  } catch (error) { showError(error.message); }
  finally { setBusy(false); }
});

for (const kind of ["report", "taxonomy"]) {
  $(`${kind}-file`).addEventListener("change", () => selectFile(kind));
  const zone = $(`${kind}-drop`);
  zone.addEventListener("dragover", (event) => { event.preventDefault(); if (!state.busy) zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    if (state.busy || !event.dataTransfer.files.length) return;
    const transfer = new DataTransfer();
    transfer.items.add(event.dataTransfer.files[0]);
    $(`${kind}-file`).files = transfer.files;
    selectFile(kind);
  });
}

document.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener("change", () => {
  $("json-mode").hidden = mode() !== "json_schema";
  $("pdf-mode").hidden = mode() !== "taxonomy_pdf";
  $("taxonomy-file").required = mode() === "taxonomy_pdf";
}));

$("format-schema").addEventListener("click", () => {
  try { $("schema-editor").value = JSON.stringify(JSON.parse($("schema-editor").value), null, 2); showError(""); }
  catch { showError("The schema is not valid JSON. Check its commas and brackets."); }
});
$("schema-file").addEventListener("change", async () => {
  const file = $("schema-file").files[0];
  if (!file) return;
  if (file.size > 256 * 1024) { showError("JSON Schema must be 256 KiB or smaller."); return; }
  try { $("schema-editor").value = JSON.stringify(JSON.parse(await file.text()), null, 2); showError(""); }
  catch { showError("The selected file is not valid JSON."); }
});
$("preview-report").addEventListener("click", () => { if (state.reportURL) window.open(state.reportURL, "_blank", "noopener,noreferrer"); });

function setPrompts(prompts) {
  $("system-prompt").value = prompts.system_prompt || "";
  $("user-prompt").value = prompts.user_prompt || "";
}

$("save-prompts").addEventListener("click", () => {
  try {
    localStorage.setItem("document-lab-prompts", JSON.stringify({ system_prompt: $("system-prompt").value, user_prompt: $("user-prompt").value }));
    $("prompt-status").textContent = "Saved in this browser. Each new job gets its own copy.";
  } catch { showError("Browser storage is unavailable. Your edits still apply to the next job in this tab."); }
});
$("reset-prompts").addEventListener("click", () => {
  setPrompts(state.config?.default_prompts || {});
  try { localStorage.removeItem("document-lab-prompts"); } catch { /* Optional persistence. */ }
  $("prompt-status").textContent = "Default prompts restored. Existing jobs keep their original prompts.";
});

$("extraction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  showError("");
  const data = new FormData();
  const file = $("report-file").files[0];
  if (!file) { showError("Choose a report PDF first."); return; }
  data.append("city_pdf", file);
  data.append("city", $("report-label").value.trim() || file.name.replace(/\.pdf$/i, ""));
  if (!$("system-prompt").value.trim()) { showError("Enter a system prompt, or use Reset defaults."); return; }
  data.append("system_prompt", $("system-prompt").value);
  data.append("user_prompt", $("user-prompt").value);
  data.append("use_mistral_ocr", String($("mistral-ocr").checked));
  data.append("auto_repair", String($("auto-repair").checked));
  data.append("max_repairs", $("max-repairs").value);
  if (state.benchmark) data.append("benchmark_case", state.benchmark);
  if (mode() === "json_schema") {
    try {
      const schema = JSON.parse($("schema-editor").value);
      if (schema.type !== "object") throw new Error();
      data.append("data_schema", JSON.stringify(schema));
    } catch { showError('Provide valid JSON Schema with a root "type": "object".'); return; }
  } else {
    const taxonomy = $("taxonomy-file").files[0];
    if (!taxonomy) { showError("Choose a taxonomy PDF."); return; }
    data.append("taxonomy_pdf", taxonomy);
  }
  stopPolling();
  state.job = null;
  $("activity-panel").hidden = true;
  $("job-id").textContent = "Waiting for acceptance";
  setBusy(true);
  $("results").hidden = true;
  $("cancel").hidden = true;
  showJob("preparing", $("mistral-ocr").checked ? "Running Mistral OCR on the uploaded PDFs before starting the OpenAI agent. This can take several minutes. Keep this page open until you receive a job ID." : "Uploading the report and data definition. Keep this page open until you receive a job ID.");
  try {
    const job = await api("/v1/extractions", { method: "POST", body: data });
    startPolling(job.job_id, state.reportURL);
  } catch (error) {
    setBusy(false);
    showJob("submission_error", "Submission was not confirmed. A timed-out request may still have started a job; check OpenAI session logs before retrying.");
    showError(error.message);
  }
});

$("cancel").addEventListener("click", async () => {
  if (!state.job) return;
  $("cancel").disabled = true;
  try {
    await api(`/v1/extractions/${encodeURIComponent(state.job)}/cancel`, { method: "POST" });
    showJob("cancellation_requested", "Cancellation was requested. Waiting for confirmation that the agent has stopped…");
    clearTimeout(state.timer);
    state.timer = setTimeout(() => poll(state.generation), 2000);
  } catch (error) { showError(error.message); }
  finally { $("cancel").disabled = false; }
});
$("resume-job").addEventListener("click", () => {
  const id = $("resume-id").value.trim();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(id)) { showError("Enter a valid job ID."); return; }
  showError("");
  startPolling(id);
});
$("copy-job").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(state.job); $("copy-job").textContent = "Copied"; setTimeout(() => { $("copy-job").textContent = "Copy ID"; }, 2000); }
  catch { showError("Copy the job ID shown in the status panel."); }
});
$("download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = element("a"); link.href = url; link.download = state.sample ? "example-output.json" : "extraction.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const tab of ["evidence", "json"]) {
  $(`${tab}-tab`).addEventListener("click", () => switchTab(tab));
  $(`${tab}-tab`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "evidence" : event.key === "End" ? "json" : tab === "evidence" ? "json" : "evidence";
    switchTab(next); $(`${next}-tab`).focus();
  });
}

$("sample").addEventListener("click", () => {
  showError("");
  $("job-panel").hidden = true;
  $("activity-panel").hidden = true;
  renderResult({
    requires_review: true,
    validation: { data_schema: "passed", warnings: [], data_schema_errors: [] },
    result: {
      city: "Example city report", schema_version: "1.0", data: { city: "Example City", reporting_year: 2025, electricity_mwh: null }, city_pages_reviewed: [1, 2, 3],
      fields: [
        { field_id: "/city", status: "found", observations: [{ value: "Example City", unit: null, year: null, geography: null, evidence: [{ pdf_page: 1, printed_page: null, quote: "Example City · Annual climate report" }], notes: [] }], searched_pages: [1], explanation: "The report's cover identifies the city." },
        { field_id: "/reporting_year", status: "found", observations: [{ value: "2025", unit: null, year: "2025", geography: null, evidence: [{ pdf_page: 2, printed_page: "1", quote: "This report covers the reporting year 2025." }], notes: [] }], searched_pages: [2], explanation: "The introduction states the reporting year." },
        { field_id: "/electricity_mwh", status: "ambiguous", observations: [], searched_pages: [3], explanation: "A consumption value is present, but its unit is unclear. The value stays null until the source can be verified." },
      ], warnings: ["Illustrative example. No report was processed and no API credits were used."],
    },
  }, true);
});

async function initialize() {
  try {
    state.config = await api("/v1/config");
    $("ocr-help").textContent = state.config.mistral_ocr_ready ? "When on, report and taxonomy PDFs are sent to Mistral in parallel. OpenAI starts after OCR finishes, with original PDFs and structured OCR context side by side. Uses Mistral API billing. See How to below." : "To enable this optional step, add MISTRAL_API_KEY to .env and restart. Original PDFs work without it. See How to below for context and parallel processing.";
    setPrompts(state.config.default_prompts || {});
    try {
      const saved = JSON.parse(localStorage.getItem("document-lab-prompts") || "null");
      if (saved && typeof saved.system_prompt === "string" && typeof saved.user_prompt === "string") {
        setPrompts(saved);
        $("prompt-status").textContent = "Loaded your saved prompts from this browser.";
      }
    } catch { /* Invalid or unavailable browser storage does not prevent extraction. */ }
    $("connection").textContent = state.config.ready ? "OpenAI configured" : "Setup needed";
    $("connection").prepend(element("span", "dot"));
    $("connection").classList.toggle("ready", state.config.ready);
    $("auth-settings").hidden = !state.config.authentication_required;
    if (!state.config.ready) {
      $("setup-notice").textContent = "Add OPENAI_API_KEY to the demo's .env file and restart the server to run an extraction. You can preview example output now without an API call.";
      $("setup-notice").hidden = false;
    }
    setBusy(false);
    try { $("resume-id").value = sessionStorage.getItem("document-lab-job") || ""; } catch { /* Optional convenience. */ }
  } catch (error) { showError(error.message); }
}
initialize();
