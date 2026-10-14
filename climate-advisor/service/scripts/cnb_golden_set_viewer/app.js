/* CNB golden-set viewer. Reads runs/index.js and loads runs/<id>/viewer.js on demand
   (both written by scripts/cnb_golden_set_viewer/publish.py). Works from disk. */
(() => {
  "use strict";
  const INDEX = window.GOLDEN_INDEX || [];
  const CURRENT = new URLSearchParams(location.search).get("run") || INDEX[0]?.id || null;
  let D = null; // the payload of the run being viewed
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");
  const tip = document.getElementById("tip");

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pct = (x) => (x == null || Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
  const short = (h, n = 10) => (h ? String(h).slice(0, n) : "–");
  const enc = encodeURIComponent;

  const STATUS = {
    covered: ["good", "✓", "Covered"],
    partially_covered: ["warning", "◐", "Partially covered"],
    missing: ["serious", "○", "Missing"],
    contradicted: ["critical", "✕", "Contradicted"],
    supported: ["good", "✓", "Supported"],
    partially_supported: ["warning", "◐", "Partially supported"],
    unsupported: ["serious", "○", "Unsupported"],
    uncertain: ["neutral", "?", "Uncertain"],
    satisfied: ["good", "✓", "Satisfied"],
    partially_satisfied: ["warning", "◐", "Partially satisfied"],
    not_satisfied: ["serious", "○", "Not satisfied"],
    flagged: ["good", "✓", "Flagged"],
    partially_flagged: ["warning", "◐", "Partially flagged"],
    not_flagged: ["serious", "○", "Not flagged"],
    fabricated: ["critical", "✕", "Invented value"],
    valid: ["good", "✓", "Valid"],
    answerable_from_inputs: ["serious", "○", "Answerable from inputs"],
    answered_elsewhere: ["critical", "✕", "Answered in another chapter"],
    detected: ["good", "✓", "Detected"],
    partially_detected: ["warning", "◐", "Partially detected"],
    missed: ["serious", "○", "Missed"],
    false_alarm: ["critical", "✕", "False alarm"],
    duplicate: ["neutral", "=", "Duplicate"],
    applied: ["good", "✓", "Applied"],
    partially_applied: ["warning", "◐", "Partially applied"],
    not_applied: ["serious", "○", "Not applied"],
    preserved: ["good", "✓", "Preserved"],
    altered: ["serious", "○", "Altered"],
    removed: ["critical", "✕", "Removed"],
    contradicts_source: ["critical", "✕", "Contradicts source"],
    out_of_scope: ["serious", "○", "Out of scope"],
    transferred: ["good", "✓", "Transferred"],
    lost_in_drafting: ["critical", "✕", "Lost in drafting"],
    lost_in_extraction: ["serious", "○", "Lost in extraction"],
    recovered: ["warning", "◐", "Recovered from full text"],
    extraction_unavailable: ["neutral", "–", "Extraction unavailable"],
    pass: ["good", "✓", "Pass"],
    fail: ["critical", "✕", "Fail"],
    error: ["neutral", "!", "Evaluation error"],
    notrun: ["neutral", "–", "Not run"],
    clear: ["good", "✓", "Self-contained"],
    unclear: ["warning", "◐", "Lacks context"],
    ready: ["good", "✓", "Ready"],
    needs_review: ["warning", "◐", "Needs review"],
    incomplete: ["serious", "○", "Incomplete"],
  };
  const RANK = { good: 0, neutral: 1, warning: 2, serious: 3, critical: 4 };
  const cls = (v) => (STATUS[v] || STATUS.notrun)[0];
  const label = (v) => (STATUS[v] || [0, 0, v ?? "n/a"])[2];
  const badge = (v, text) => {
    const [c, icon, name] = STATUS[v] || ["neutral", "?", v ?? "n/a"];
    return `<span class="badge s-${c}"><span class="dot" aria-hidden="true">${icon}</span>${esc(text || name)}</span>`;
  };
  const bigBadge = (v, text) => {
    const [c, icon, name] = STATUS[v] || STATUS.notrun;
    return `<span class="verdict-big s-${c}"><span class="dot" aria-hidden="true">${icon}</span>${esc(text || name)}</span>`;
  };
  const worst = (...cs) => cs.filter(Boolean).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "good");

  const STAGES = {
    extraction: { n: 1, label: "Extraction", what: "Source analysis keeps quotations and topic labels" },
    chapter_writing: { n: 2, label: "Chapter writing", what: "The drafter writes every chapter from this run's extraction" },
    verification: { n: 3, label: "Verification", what: "The validator checks a draft with seeded defects" },
    editing: { n: 4, label: "Editing", what: "The edit pipeline applies chat requests to the draft" },
  };
  const STAGE_KEYS = Object.keys(STAGES);
  const fixtureById = (id) => D.fixtures.find((f) => f.golden.fixture_id === id);
  const fixtureStages = (f) => STAGE_KEYS.filter((s) => (s === "extraction" ? f.golden.extraction : f.golden[s]));
  const chapterTitle = (f, ref) => f.drafting_input?.chapter_schema.find((c) => c.chapter_ref === ref)?.title || ref;

  function stageStatus(st) {
    const r = st?.report;
    if (!r) return "notrun";
    if (r.evaluation_errors?.length || !r.judgment) return "error";
    if (r.integrity_failures?.length || r.semantic_failures?.length) return "fail";
    return "pass";
  }
  const judgmentOf = (f, stage) => f.stages[stage]?.judgment || f.stages[stage]?.report?.judgment || null;
  const metricsOf = (f, stage) => f.stages[stage]?.report?.metrics || {};

  // ---------- links between units ----------
  // Every quotation extraction kept: document-level first, then each chapter's.
  function retained(f) {
    const a = f.analysis || {};
    return [
      ...(a.key_excerpts || []).map((e, i) => ({ key: `${i}`, label: `retained quotation #${i}`, e })),
      ...(a.chapter_excerpts || []).flatMap((c) =>
        c.excerpts.map((e, i) => ({ key: `${c.chapter_ref}/${i}`, label: `${chapterTitle(f, c.chapter_ref)} quotation #${i}`, e }))),
    ];
  }
  // retained/<n>/<anchor> or retained/<chapter_ref>/<n>/<anchor>
  const retainedKey = (rest) => (isNaN(+rest[0]) ? `${rest[0]}/${rest[1]}` : rest[0]);
  const retainedAt = (f, rest) => retained(f).find((r) => r.key === retainedKey(rest));
  function refHref(fid, stage, unitId) {
    const [kind, ...rest] = unitId.split("/");
    const to = (tab, id) => `#/f/${fid}/${tab}/${enc(id)}`;
    if (kind === "source") return to("source", "u-" + rest.join("/"));
    if (kind === "retained") return to("extraction", "ex-" + retainedKey(rest));
    if (kind === "topic") return to("extraction", "tp-" + rest[0]);
    if (kind === "chapter") return to("chapter_writing", "ch-" + rest.join("/"));
    if (kind === "gap") return to("chapter_writing", `rg-${rest[0]}-${rest[1]}`);
    if (kind === "finding") return to("verification", "fd-" + rest[0]);
    if (kind === "draft" || kind === "draft-gap")
      return stage === "verification" ? to("verification", "sd-" + rest[0]) : to("reference", "rd-" + rest[0]);
    if (kind === "change") return to("editing", `cg-${rest[0]}-${rest[1]}`);
    if (kind === "edited") return to("editing", `ed-${rest[0]}-${rest[1]}`);
    if (kind === "instruction") return to("editing", "case-" + rest[0]);
    if (kind === "context") return `#/f/${fid}/input`;
    return null;
  }
  function refLabel(f, unitId) {
    const [kind, ...rest] = unitId.split("/");
    if (kind === "source") {
      const page = /^page-(\d+)$/.exec(rest.join("/"));
      return page ? `original source · page ${page[1]}` : `original source · ${rest.slice(1).join(" / ")}`;
    }
    if (kind === "retained") return retainedAt(f, rest)?.label || `retained quotation #${retainedKey(rest)}`;
    if (kind === "topic") return `topic label #${rest[0]}`;
    if (kind === "chapter") return `draft · ${chapterTitle(f, rest.join("/"))}`;
    if (kind === "gap") return `raised gap · ${chapterTitle(f, rest[0])} · ${rest[1]}`;
    if (kind === "finding") return `validator finding #${rest[0]}`;
    if (kind === "draft") return `draft before edit/validation · ${chapterTitle(f, rest[0])}`;
    if (kind === "draft-gap") return `open gap · ${chapterTitle(f, rest[0])} · ${rest[1]}`;
    if (kind === "change") return `applied change · case ${rest[0]} #${rest[1]}`;
    if (kind === "edited") return `edited chapter · case ${rest[0]} · ${chapterTitle(f, rest[1])}`;
    if (kind === "instruction") return `user instruction · case ${rest[0]}`;
    if (kind === "context") return `authoritative context · ${rest.join(".")}`;
    if (kind === "supplied") {
      const scope = rest[0] === "shared" ? "all chapters" : chapterTitle(f, rest[0]);
      return `supplied to drafter (${scope}) · ${rest.slice(1).join(".")}`;
    }
    return unitId;
  }
  // Judge quotes only point to text; one not found verbatim is shown as written.
  function unitText(f, stage, unitId) {
    const [kind, ...rest] = unitId.split("/");
    if (kind === "source") return f.units.find((u) => u.anchor === rest.join("/"))?.text;
    if (kind === "retained") return retainedAt(f, rest)?.e.text;
    if (kind === "topic") return f.analysis?.topics?.[+rest[0]];
    if (kind === "chapter") return f.stages.chapter_writing?.drafts?.find((d) => d.chapter_ref === rest.join("/"))?.body_markdown;
    if (kind === "draft") {
      const pool = stage === "verification" ? f.stages.verification?.seeded_draft : f.reference_draft?.chapters;
      return pool?.find((c) => c.chapter_ref === rest[0])?.body_markdown;
    }
    if (kind === "edited") {
      const record = f.stages.editing?.cases?.find((c) => c.case_id === rest[0]);
      return record?.edited_chapters?.[rest[1]];
    }
    if (kind === "change") {
      const change = f.stages.editing?.cases?.find((c) => c.case_id === rest[0])?.changes?.[+rest[1]];
      return change ? `Before: ${change.before}\nAfter: ${change.after}` : undefined;
    }
    if (kind === "instruction") return f.golden.editing?.cases.find((c) => c.id === rest[0])?.instruction;
    return undefined;
  }
  function quote(f, stage, ref, kind = "out") {
    const href = refHref(f.golden.fixture_id, stage, ref.unit_id);
    const text = unitText(f, stage, ref.unit_id);
    const bad = text != null && !text.includes(ref.quote);
    const where = `${bad ? `<b style="color:var(--warning)">not found verbatim in this unit</b> · ` : ""}${esc(refLabel(f, ref.unit_id))}${href ? " →" : ""}`;
    const inner = `${esc(ref.quote)}<span class="where">${where}</span>`;
    const k = kind + (bad ? " bad" : "");
    return href ? `<a class="quote ${k}" href="${href}">${inner}</a>` : `<div class="quote ${k}">${inner}</div>`;
  }
  const quotes = (f, stage, refs, kind, empty = "None cited") =>
    refs?.length ? refs.map((r) => quote(f, stage, r, kind)).join("") : `<div class="empty">${esc(empty)}</div>`;
  const unitForText = (f, text) => f.units.find((u) => u.text.includes(text));

  // ---------- highlighting ----------
  function segments(text, spans) {
    const iv = [];
    for (const s of spans) {
      if (!s.quote) continue;
      const a = text.indexOf(s.quote);
      if (a >= 0) iv.push({ a, b: a + s.quote.length, s });
    }
    const pts = [...new Set([0, text.length, ...iv.flatMap((x) => [x.a, x.b])])].sort((x, y) => x - y);
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      out.push({ text: text.slice(a, b), act: iv.filter((x) => x.a <= a && x.b >= b).map((x) => x.s) });
    }
    return out;
  }
  function markOpen(act) {
    let plain = [...new Set(act.filter((s) => !s.status).map((s) => s.cls))];
    if (plain.includes("gold") && plain.includes("kept")) plain = plain.filter((c) => c !== "gold" && c !== "kept").concat("both");
    const claims = act.filter((s) => s.status);
    const c = claims.length ? claims.reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a)) : null;
    const classes = [...plain, ...(c ? ["cl", `s-${c.status}`] : [])].join(" ");
    const tips = act.map((s) => s.tip).filter(Boolean).join("<hr style='border:0;border-top:1px solid #555;margin:6px 0'>");
    const go = c?.go || act.find((s) => s.go)?.go;
    return `<mark class="${classes}"${tips ? ` data-tip="${esc(tips)}"` : ""}${go ? ` data-go="${esc(go)}"` : ""}>`;
  }
  // Markdown with marks: wrap spans in private-use sentinels per line, render, then swap in tags.
  function highlightMd(text, spans) {
    const opens = [];
    let src = "";
    for (const seg of segments(text, spans)) {
      if (!seg.act.length) { src += seg.text; continue; }
      const idx = opens.push(markOpen(seg.act)) - 1;
      src += seg.text
        .split("\n")
        .map((line) => {
          if (!line) return line;
          const m = /^(\s*(?:[-*+]|\d+\.|#{1,6}|>)\s+)/.exec(line);
          const lead = m ? m[1] : "";
          return `${lead}${idx}${line.slice(lead.length)}`;
        })
        .join("\n");
    }
    return md(src).replace(/(\d+)/g, (_, i) => opens[+i]).replace(//g, "</mark>");
  }
  const MARKER_RE = /\[Information needed:[^\]]+\]/g;
  const markerSpans = (body, tipFor) =>
    [...body.matchAll(MARKER_RE)].map((m) => ({ quote: m[0], cls: "marker", tip: tipFor ? tipFor(m[0]) : "<b>Missing-information marker</b>" }));

  // ---------- tiny markdown ----------
  function inline(t) {
    return esc(t)
      .replace(/!\[[^\]]*\]\([^)\s]*\)/g, '<span class="fig">▧ figure</span>')
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  const bare = (l) => l.replace(/\d+|/g, "");
  function md(src) {
    const lines = src.replace(/\r/g, "").split("\n");
    let html = "", i = 0;
    const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(bare(l));
    const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => inline(c.trim()));
    const listRe = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
    while (i < lines.length) {
      const line = lines[i];
      if (!bare(line).trim()) { i++; continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        const n = Math.min(4, m[1].length + 1);
        html += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue;
      }
      if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(bare(line))) { html += "<hr>"; i++; continue; }
      if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        html += `<table><thead><tr>${cells(line).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
        i += 2;
        while (i < lines.length && lines[i].includes("|") && bare(lines[i]).trim()) {
          html += `<tr>${cells(lines[i]).map((c) => `<td>${c}</td>`).join("")}</tr>`; i++;
        }
        html += "</tbody></table>"; continue;
      }
      if ((m = listRe.exec(line))) {
        const ordered = /\d/.test(m[2]);
        html += ordered ? "<ol>" : "<ul>";
        while (i < lines.length && (m = listRe.exec(lines[i]))) {
          let body = m[3]; i++;
          while (i < lines.length && bare(lines[i]).trim() && !listRe.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
            body += " " + lines[i].trim(); i++;
          }
          html += `<li>${inline(body)}</li>`;
        }
        html += ordered ? "</ol>" : "</ul>"; continue;
      }
      let para = line; i++;
      while (i < lines.length && bare(lines[i]).trim() && !/^(#{1,6})\s/.test(lines[i]) && !listRe.test(lines[i]) &&
             !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
        para += "\n" + lines[i]; i++;
      }
      html += `<p>${inline(para).replace(/\n/g, "<br>")}</p>`;
    }
    return html;
  }

  // ---------- charts ----------
  const COLOR = {
    covered: "var(--good)", partially_covered: "var(--warning)", missing: "var(--serious)", contradicted: "var(--critical)",
  };
  function verdictStack(counts, total, order = ["covered", "partially_covered", "missing", "contradicted"], legend = true) {
    if (!total) return "";
    const color = (k) => `var(--${cls(k)})`;
    return `<div class="stack" role="img" aria-label="${order.map((k) => `${label(k)} ${counts[k] || 0}`).join(", ")}">
      ${order.filter((k) => counts[k]).map((k) => `<div style="flex:${counts[k]};background:${color(k)}" data-tip="${esc(`<b>${label(k)}</b>${counts[k]} of ${total}`)}"></div>`).join("")}
    </div>${legend ? `<div class="legend">${order.map((k) => `<span><i style="background:${color(k)}"></i>${label(k)} <b>${counts[k] || 0}</b></span>`).join("")}</div>` : ""}`;
  }
  function meterBar(value, gate, invert = false) {
    const ok = invert ? value <= gate : value >= gate;
    return `<div class="meter" data-tip="${esc(`${pct(value)} measured · ${invert ? "max" : "gate"} ${invert ? "≤" : "≥"} ${pct(gate)}`)}">
      <div class="fill" style="width:${Math.max(0, Math.min(1, value)) * 100}%;background:${ok ? "var(--good)" : "var(--serious)"}"></div>
      <div class="tick" style="left:calc(${gate * 100}% - 1px)"></div></div>`;
  }
  function meter(value, gate, text, invert = false) {
    if (value == null) return `<div class="tile"><div class="lbl">${esc(text)}</div><div class="val">–</div></div>`;
    const ok = invert ? value <= gate : value >= gate;
    return `<div class="tile">
      <div class="lbl">${esc(text)}</div>
      <div class="row" style="gap:10px;margin-top:2px"><span class="val">${pct(value)}</span>${badge(ok ? "pass" : "fail", ok ? (invert ? "Within limit" : "Meets gate") : invert ? "Over limit" : "Below gate")}</div>
      ${meterBar(value, gate, invert)}
      <div class="meter-lbl"><span>0%</span><span>${invert ? "max" : "gate"} ${pct(gate)}</span><span>100%</span></div>
    </div>`;
  }
  function countTile(n, total, text, note) {
    const ok = n === total;
    return `<div class="tile">
      <div class="lbl">${esc(text)}</div>
      <div class="row" style="gap:10px;margin-top:2px"><span class="val">${n}<span class="muted" style="font-size:18px"> / ${total}</span></span>${badge(ok ? "pass" : "fail", ok ? "All" : `${total - n} failing`)}</div>
      ${note ? `<div class="muted small" style="margin-top:8px">${esc(note)}</div>` : ""}
    </div>`;
  }
  const plainTile = (value, text, note) =>
    `<div class="tile"><div class="lbl">${esc(text)}</div><div class="val">${esc(value)}</div>${note ? `<div class="muted small" style="margin-top:8px">${esc(note)}</div>` : ""}</div>`;

  // ---------- stage summaries (shared by overview and tabs) ----------
  function factStats(f, stage, j) {
    const facts = stage === "extraction" ? f.golden.extraction.facts : f.golden.chapter_writing?.facts || [];
    const req = new Set(facts.filter((x) => x.required).map((x) => x.id));
    const counts = {};
    for (const v of j?.facts || []) if (req.has(v.id)) counts[v.verdict] = (counts[v.verdict] || 0) + 1;
    return { required: req.size, counts, coverage: req.size ? (counts.covered || 0) / req.size : 1 };
  }
  function claimStatus(c, stage) {
    let s = cls(c.verdict);
    if (stage !== "extraction") s = worst(s, cls(c.supplied_verdict || "uncertain"));
    if (!c.self_contained) s = worst(s, "warning");
    return s;
  }
  function stageCell(f, stage) {
    const st = f.stages[stage];
    const status = stageStatus(st);
    const j = judgmentOf(f, stage);
    const m = metricsOf(f, stage);
    const fid = f.golden.fixture_id;
    const errs = st?.report?.evaluation_errors || [];
    let body = "";
    if (stage === "extraction" && j) {
      const fs = factStats(f, stage, j);
      const gate = f.golden.extraction.thresholds.min_required_fact_coverage;
      body = `${meterBar(fs.coverage, gate)}${verdictStack(fs.counts, fs.required, undefined, false)}
        <div class="cellnote">${fs.counts.covered || 0}/${fs.required} facts retained · topics ${pct(m.topic_coverage)}</div>`;
    } else if (stage === "chapter_writing" && j) {
      const fs = factStats(f, stage, j);
      const th = f.golden.chapter_writing.thresholds;
      body = `<div class="mini-row"><span>facts</span>${meterBar(fs.coverage, th.min_required_fact_coverage)}</div>
        <div class="mini-row"><span>gaps</span>${meterBar(m.gap_recall ?? 0, th.min_gap_recall)}</div>
        <div class="cellnote">${fs.counts.covered || 0}/${fs.required} facts · ${(j.flagged_gaps || []).filter((g) => g.verdict === "valid").length}/${(j.flagged_gaps || []).length} raised gaps valid · transfer ${pct(m.transfer_rate)}</div>`;
    } else if (stage === "verification" && j) {
      const th = f.golden.verification.thresholds;
      body = `${meterBar(m.defect_recall ?? 0, th.min_defect_recall)}
        <div class="cellnote">${j.defects.filter((d) => d.verdict === "detected").length}/${j.defects.length} defects detected · ${m.false_alarms ?? "–"} false alarm(s) of ${m.model_findings ?? "–"} findings</div>`;
    } else if (stage === "editing" && j) {
      const checks = st.report.details?.cases || [];
      body = `${meterBar(m.case_pass_rate ?? 0, 1)}
        <div class="cellnote">${Math.round((m.case_pass_rate ?? 0) * checks.length)}/${checks.length} cases pass · ${m.unsupported_changes ?? 0} unsupported change(s)</div>`;
    }
    if (status === "error") body += `<div class="cellnote"><b>Unofficial:</b> ${esc(errs[0] || "")}</div>`;
    return `<td><a href="#/f/${fid}/${stage}">${badge(status)}</a>${body}</td>`;
  }

  // ---------- approach (static method per stage) ----------
  const METHOD = {
    extraction: {
      question: "Do the quotations that production source analysis keeps preserve the facts a reviewer needs?",
      input: ["The original document exactly as CityCatalyst delivers it (pinned <code>source.md</code>; the PDF it came from is kept for reference)."],
      production: ["Source analysis: reader and synthesizer agents partition the document, keep exact quotations with page or heading anchors, and label topics."],
      python: ["Every quotation is an exact substring at a valid page or heading.", "The generated summary is saved for diagnosis but never sent to the judge."],
      judge: ["Expected fact → retained quotations: covered, partial, missing or contradicted.", "Expected topic → topic labels.", "Retained quotation → complete source: misleading, or missing a qualifier?"],
      gates: "Required facts fully covered ≥ 75% · topics ≥ 60% · no unsupported or unclear quotation",
    },
    chapter_writing: {
      question: "Does the drafter carry the facts into the right chapters, support every claim, and flag missing information instead of inventing it?",
      input: ["This run's extraction output, the complete source text, the funder's application template, and authoritative city context."],
      production: ["Chapter drafter, chapter by chapter in template order; each chapter sees every earlier chapter. Structured gaps pass through production's sanitizing."],
      python: ["Chapter identity and non-empty chapters.", "Marker/gap parity: every <code>[Information needed]</code> marker has exactly one structured gap (production persistence enforces this).", "Transfer table: extraction verdict vs draft verdict per linked fact."],
      judge: ["Expected fact → allowed chapters.", "Every claim → original source and → evidence actually supplied to that chapter.", "Each chapter answers its template question.", "Expected gaps flagged, not invented.", "Every raised gap genuinely missing, not answered elsewhere."],
      gates: "Facts ≥ 70% · expected gaps flagged ≥ 75% · no unsupported claim, invented value, false gap or contradiction",
    },
    verification: {
      question: "Does the production chapter validator catch known problems without raising false alarms?",
      input: ["A frozen, reviewed reference draft with 6 seeded defects per document: cross-chapter conflicts, logic errors, inconsistent gap flags, and unflagged missing information."],
      production: ["Chapter validator, once per chapter: a completeness pass and consistency passes against the other chapters."],
      python: ["Every seeded edit matches exactly once and keeps marker/gap parity.", "Open-gap findings come from persisted gaps, not the model, so they are excluded.", "Strict check: a matching finding uses an expected category and names every expected chapter."],
      judge: ["Seeded defect → findings: detected, partial or missed.", "Every other model finding: valid problem, false alarm or duplicate."],
      gates: "Defects detected ≥ 75% · false alarms ≤ 25% of model findings · no missed defect",
    },
    editing: {
      question: "Does a chat edit do what the user asked, keep what must survive, and leave the document consistent?",
      input: ["The reference draft plus one chat request per case: fill a gap, propagate a change across chapters, rewrite while keeping facts, or ask for a value nobody supplied."],
      production: ["Edit planner with exact-anchor tools and an independent semantic review, then plan validation and anchor replacement. All validated changes are accepted, as a user would."],
      python: ["Outcome: edit, or clarification when no value was given.", "Chapters changed outside the allowed set.", "Missing-information markers removed."],
      judge: ["Each expected change applied.", "Each protected statement preserved.", "Each applied change authorized by the instruction or the evidence.", "No contradiction left after the edit."],
      gates: "Every case passes all checks",
    },
  };
  const cityOf = (f) => f.drafting_input?.cc_context?.city?.name || f.golden.fixture_id;
  const caseType = (c) =>
    c.expected_outcome === "clarification" ? "Ask for a missing value"
    : c.allowed_chapters.length > 1 ? "Propagate across chapters"
    : /shorten|skróć/i.test(c.id + " " + c.instruction) ? "Rewrite, keep facts"
    : "Fill a gap";
  const CASE_TYPES = ["Fill a gap", "Propagate across chapters", "Rewrite, keep facts", "Ask for a missing value"];

  function listBlock(title, items) {
    return `<div class="card"><div class="eyebrow">${esc(title)}</div><ul class="method">${items.map((x) => `<li>${x}</li>`).join("")}</ul></div>`;
  }

  // ---------- overview ----------
  function overview() {
    const all = D.fixtures.flatMap((f) => fixtureStages(f).map((s) => stageStatus(f.stages[s])));
    const overall = all.every((s) => s === "pass") ? "pass" : all.includes("fail") ? "fail" : all.includes("error") ? "error" : "notrun";
    const run = D.run || {};
    return `
    <div class="eyebrow">Concept Note Builder · CC-750 golden set</div>
    <div class="spread">
      <div>
        <h1>Does CNB keep the facts straight, end to end?</h1>
        <p class="lede">The benchmark follows a document through the production pipeline in four stages and asks a different question at each.
        Production code runs unchanged. Python checks every exact contract, and an independent LLM judge scores meaning. The judge is calibrated with
        examples quoted from the documents themselves and cites the text behind every verdict; its quotations point to evidence and are never matched by code.</p>
      </div>
      <div style="text-align:right">${bigBadge(overall, overall === "pass" ? "All stages pass" : overall === "fail" ? "Benchmark failing" : undefined)}</div>
    </div>

    <div class="pipeline">${STAGE_KEYS.map((s, i) => `
      <a class="pstage" href="#/stage/${s}">
        <div class="pnum">${STAGES[s].n}</div>
        <div class="ptitle">${esc(STAGES[s].label)}</div>
        <div class="pq">${esc(METHOD[s].question)}</div>
        <div class="pdocs">${D.fixtures.map((f) => {
          const st = stageStatus(f.stages[s]);
          return `<span class="pdoc s-${cls(st)}" data-tip="${esc(`<b>${esc(cityOf(f))}</b>${esc(label(st))}`)}"><i></i>${esc(cityOf(f))}</span>`;
        }).join("")}</div>
        <div class="pmore">Method and results →</div>
      </a>${i < 3 ? `<div class="parrow" aria-hidden="true">→</div>` : ""}`).join("")}
    </div>

    <h2>Three documents</h2>
    <p class="sub">Real-shaped inputs in two languages: a synthetic plan that exercises Markdown anchors, a real US engineering study, and a real Polish municipal plan.</p>
    <div class="grid g3">${D.fixtures.map(docCard).join("")}</div>

    <h2>How a verdict is made</h2>
    <div class="grid g4">
      <div class="card"><div class="eyebrow">Python · exact</div><h3>Contracts, not meaning</h3><p class="small muted">Quotation and locator exactness, marker/gap parity, seeded edits, which chapters an edit changed, and the judge's output contract. Never keyword overlap.</p></div>
      <div class="card"><div class="eyebrow">LLM judge · semantic</div><h3>Every verdict cites text</h3><p class="small muted">One structured judgment per stage and document. References point to the text behind a verdict; a misquote never voids the judgment.</p></div>
      <div class="card"><div class="eyebrow">Calibration</div><h3>${Object.values(D.examples).reduce((n, l) => n + l.length, 0)} few-shot examples</h3><p class="small muted">Passages quoted verbatim from the three documents and tested never to overlap golden evidence, so examples teach the standard without leaking answers.</p></div>
      <div class="card"><div class="eyebrow">Judge mistakes</div><h3>Not product failures</h3><p class="small muted">Only a missing or repeated verdict makes the stage an <b>evaluation error</b>. Quotes are never matched by code: an inflected or misplaced quote is shown as written and the verdict stands.</p></div>
    </div>

    <h2>What this run found</h2>
    ${findings()}

    <h2>Results matrix</h2>
    <p class="sub">One cell per document and stage. Black ticks are gates.</p>
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="score">
        <thead><tr><th>Document</th>${STAGE_KEYS.map((s) => `<th><a href="#/stage/${s}">${STAGES[s].n} · ${STAGES[s].label}</a></th>`).join("")}</tr></thead>
        <tbody>${D.fixtures.map((f) => `<tr><td><a href="#/f/${f.golden.fixture_id}/golden"><b>${esc(cityOf(f))}</b></a>
          <div class="muted small">${esc(f.golden.source.language.toUpperCase())} · ${esc(f.golden.source.source_format)} · ${f.units.length} units</div></td>
          ${STAGE_KEYS.map((s) => (fixtureStages(f).includes(s) ? stageCell(f, s) : `<td class="na">–</td>`)).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>

    <h2>Provenance</h2>
    <div class="grid g2">
      <div class="card" style="padding:0"><table>
        <thead><tr><th>Role</th><th>Model</th><th>Reasoning</th></tr></thead>
        <tbody>${Object.entries(run.models || {}).map(([role, m]) => `<tr><td>${esc(role.replace(/_/g, " "))}</td><td class="mono">${esc(m.name)}</td><td>${esc(m.reasoning_effort || "–")}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="card"><dl class="kv">
        <dt>Run</dt><dd class="mono">${esc(run.id)}${run.label ? ` · ${esc(run.label)}` : ""}</dd>
        <dt>Generated</dt><dd>${esc(run.generated_at ? new Date(run.generated_at).toLocaleString() : "unfinished")}</dd>
        <dt>Code version</dt><dd class="mono">${esc(run.code_version || "unknown")}</dd>
        <dt>Analysis contract</dt><dd class="mono">${esc(short(run.analysis_contract_version, 16))}</dd>
        ${Object.entries(run.judge_prompt_versions || {}).map(([k, v]) => `<dt>Judge prompt · ${esc(k)}</dt><dd class="mono">sha256 ${esc(short(v, 16))}</dd>`).join("")}
      </dl></div>
    </div>`;
  }

  function docCard(f) {
    const g = f.golden;
    const d = f.drafting_input;
    const fid = g.fixture_id;
    return `<div class="card doccard">
      <div class="spread"><div class="eyebrow">${esc(g.source.language.toUpperCase())} · ${esc(g.source.source_format.toUpperCase())} · ${g.source.page_count ? `${g.source.page_count} pages` : `${f.units.length} blocks`}</div></div>
      <h3 style="font-size:17px;margin-top:4px">${esc(cityOf(f))}</h3>
      <div class="small" style="color:var(--ink-2);margin-top:4px">${esc(g.source.source_label)}</div>
      <dl class="kv small" style="margin-top:12px">
        <dt>Drafted into</dt><dd>${esc(d?.funder || "–")}: ${esc(d?.template_name || "")}</dd>
        <dt>Expectations</dt><dd>${g.extraction.facts.length} extraction facts · ${g.chapter_writing?.facts.length || 0} draft facts · ${g.chapter_writing?.gaps.length || 0} expected gaps</dd>
        <dt>Seeded · edits</dt><dd>${g.verification?.defects.length || 0} defects · ${g.editing?.cases.length || 0} edit cases</dd>
      </dl>
      <div class="row small" style="margin-top:12px">
        <a class="pill" href="#/f/${fid}/golden">Golden set</a>
        <a class="pill" href="#/f/${fid}/source">source.md</a>
        ${f.pdf ? `<a class="pill" href="${esc(f.pdf)}" target="_blank" rel="noopener">Original PDF ↗</a>` : `<span class="pill muted">native Markdown</span>`}
        <a class="pill" href="#/f/${fid}/reference">Reference draft</a>
      </div>
      ${g.source.original_pdf?.notes ? `<p class="muted small" style="margin-top:10px">${esc(g.source.original_pdf.notes)}</p>` : ""}
    </div>`;
  }

  // Data-driven highlights so the overview stays true for any run.
  function findings() {
    const items = { extraction: [], chapter_writing: [], verification: [], editing: [] };
    for (const f of D.fixtures) {
      const city = esc(cityOf(f));
      const fid = f.golden.fixture_id;
      const ej = judgmentOf(f, "extraction");
      if (ej) {
        const fs = factStats(f, "extraction", ej);
        items.extraction.push(`<b>${city}</b>: ${fs.counts.covered || 0} of ${fs.required} required facts kept in ${retained(f).length} quotations from ${f.units.length} source units.`);
      }
      const cw = f.stages.chapter_writing?.report;
      const cj = judgmentOf(f, "chapter_writing");
      if (cj) {
        const transfer = cw?.details?.transfer || [];
        const count = (k) => transfer.filter((t) => t.outcome === k).length;
        const raised = cj.flagged_gaps || [];
        const bad = cj.claims.filter((c) => claimStatus(c, "chapter_writing") !== "good").length;
        items.chapter_writing.push(`<b>${city}</b>${stageStatus(f.stages.chapter_writing) === "error" ? " <span class='muted'>(unofficial: judgment rejected)</span>" : ""}: `
          + `${transfer.length ? `${count("transferred")} facts transferred, ${count("recovered")} recovered from full text after extraction missed them, ${count("lost_in_extraction")} lost in extraction, ${count("lost_in_drafting")} lost in drafting; ` : ""}`
          + `${raised.filter((g) => g.verdict === "valid").length}/${raised.length} raised gaps genuine; ${bad} of ${cj.claims.length} claims not fully supported.`);
      }
      const vj = judgmentOf(f, "verification");
      if (vj) {
        const defects = Object.fromEntries(f.golden.verification.defects.map((d) => [d.id, d]));
        const misses = vj.defects.filter((d) => d.verdict !== "detected");
        items.verification.push(`<b>${city}</b>: ${vj.defects.length - misses.length}/${vj.defects.length} seeded defects detected`
          + `${misses.length ? `; not found: ${misses.map((d) => `<a href="#/f/${fid}/verification/sec-defects">${esc(defects[d.id]?.kind.replace(/_/g, " "))}</a> (${esc(label(d.verdict).toLowerCase())})`).join(", ")}` : ""}`
          + `; ${vj.findings.filter((x) => x.verdict === "false_alarm").length} false alarm(s).`);
      }
      const checks = f.stages.editing?.report?.details?.cases || [];
      const ej4 = judgmentOf(f, "editing");
      if (ej4) {
        const failing = (f.stages.editing.report.semantic_failures || []).concat(f.stages.editing.report.integrity_failures || []);
        const failedCases = checks.filter((c) => failing.some((x) => x.startsWith(c.case_id)) || !c.outcome_ok);
        items.editing.push(`<b>${city}</b>: ${checks.length - failedCases.length}/${checks.length} edit cases pass`
          + `${failedCases.length ? `; failing: ${failedCases.map((c) => `<a href="#/f/${fid}/editing/case-${esc(c.case_id)}">${esc(c.case_id)}</a>`).join(", ")}` : ""}.`);
      }
    }
    if (D.config?.max_key_excerpts) {
      // Runs before the context-window change recorded full_text_max_tokens.
      const window = D.config.context_window_tokens ?? D.config.full_text_max_tokens;
      items.extraction.push(`<b>Quotation limits:</b> <code>max_key_excerpts = ${D.config.max_key_excerpts}</code> per document`
        + `${D.config.max_chapter_excerpts ? ` plus <code>max_chapter_excerpts = ${D.config.max_chapter_excerpts}</code> per template chapter` : ""}.`);
      items.chapter_writing.push(`<b>Why losses are masked:</b> the drafter also gets the complete source text while `
        + `${D.config.context_window_tokens ? "its whole request" : "the sources"} fit in ${window.toLocaleString()} tokens.`);
    }
    return `<div class="grid g2">${STAGE_KEYS.map((s) => `<div class="card"><div class="eyebrow">${STAGES[s].n} · ${esc(STAGES[s].label)}</div>
      <ul class="method">${items[s].map((x) => `<li>${x}</li>`).join("") || "<li class='muted'>Not run.</li>"}</ul>
      <a class="small" href="#/stage/${s}">Compare documents →</a></div>`).join("")}</div>`;
  }

  // ---------- stage pages ----------
  function stagePage(stage) {
    const m = METHOD[stage];
    return `
      <div class="eyebrow">Stage ${STAGES[stage].n} of 4</div>
      <h1>${esc(STAGES[stage].label)}</h1>
      <p class="lede">${esc(m.question)}</p>
      <div class="grid g4" style="margin-top:22px">
        ${listBlock("Input", m.input)}
        ${listBlock("Production code under test", m.production)}
        ${listBlock("Python checks (exact)", m.python)}
        ${listBlock("LLM judge (semantic)", m.judge)}
      </div>
      <div class="callout" style="margin-top:14px"><b>Gate:</b> ${esc(m.gates)}</div>
      <div class="card" style="margin-top:14px">${lane(stage)}</div>

      <h2>Results across documents</h2>
      <div class="grid g3">${D.fixtures.map((f) => stageDocCard(f, stage)).join("")}</div>

      ${{ extraction: compareExtraction, chapter_writing: compareWriting, verification: compareVerification, editing: compareEditing }[stage]()}

      <h2>Calibration examples for this judge</h2>
      <p class="sub">Each example quotes a passage extracted verbatim from one of the documents (never golden evidence) and shows the correct verdict.</p>
      ${examplesCard(stage, true)}
      <details class="card prompt" style="margin-top:14px"><summary>Full judge prompt</summary><pre>${esc(D.prompts[stage] || "")}</pre></details>`;
  }

  function stageDocCard(f, stage) {
    const st = f.stages[stage];
    const status = stageStatus(st);
    const r = st?.report;
    const m = r?.metrics || {};
    const failures = [...(r?.evaluation_errors || []), ...(r?.integrity_failures || []), ...(r?.semantic_failures || [])];
    let tiles = "";
    const j = judgmentOf(f, stage);
    if (stage === "extraction" && j) {
      const fs = factStats(f, stage, j);
      tiles = meter(fs.coverage, f.golden.extraction.thresholds.min_required_fact_coverage, "Required facts kept") + verdictStack(fs.counts, fs.required, undefined, false);
    } else if (stage === "chapter_writing" && j) {
      const fs = factStats(f, stage, j);
      const th = f.golden.chapter_writing.thresholds;
      tiles = meter(fs.coverage, th.min_required_fact_coverage, "Required facts in allowed chapters") + meter(m.gap_recall ?? null, th.min_gap_recall, "Expected gaps flagged");
    } else if (stage === "verification" && j) {
      const th = f.golden.verification.thresholds;
      tiles = meter(m.defect_recall ?? null, th.min_defect_recall, "Seeded defects detected") + meter(m.false_alarm_rate ?? null, th.max_false_alarm_rate, "False alarm rate", true);
    } else if (stage === "editing" && j) {
      tiles = meter(m.case_pass_rate ?? null, 1, "Cases passing");
    }
    return `<div class="card">
      <div class="spread"><div><div class="eyebrow">${esc(f.golden.source.language.toUpperCase())} · ${esc(f.golden.source.source_format)}</div><h3 style="font-size:17px">${esc(cityOf(f))}</h3></div>${badge(status)}</div>
      <div style="margin-top:10px">${tiles || notRun(f, stage)}</div>
      ${failures.length ? `<details style="margin-top:10px"><summary>${failures.length} finding(s)</summary><ul class="method small">${failures.slice(0, 12).map((x) => `<li>${esc(x.length > 220 ? x.slice(0, 217) + "…" : x)}</li>`).join("")}</ul></details>` : ""}
      <a class="small" style="display:inline-block;margin-top:10px" href="#/f/${f.golden.fixture_id}/${stage}">Full detail for ${esc(cityOf(f))} →</a>
    </div>`;
  }

  function compareExtraction() {
    const cap = D.config?.max_key_excerpts;
    const perChapter = D.config?.max_chapter_excerpts;
    return `<h2>Retention at a glance</h2>
      ${cap ? `<div class="callout ${perChapter ? "" : "bad"}" style="margin-bottom:14px"><b>Production keeps at most ${cap} quotations per document${perChapter ? ` plus ${perChapter} per template chapter` : ""}</b>
        (<code>max_key_excerpts</code>${perChapter ? " and <code>max_chapter_excerpts</code>" : ""} under <code>generation.prompt_budget.cnb_sources</code> in <code>llm_config.yaml</code>).
        ${perChapter ? "Chapter quotations are chosen for each chapter's required fields." : "Long documents therefore cannot retain most expected facts, whatever the model's quality."}</div>` : ""}
      <div class="card" style="padding:0"><table>
        <thead><tr><th>Document</th><th>Source units</th><th>Quotations kept</th><th>Required facts</th><th>Topics conveyed</th></tr></thead>
        <tbody>${D.fixtures.map((f) => {
          const j = judgmentOf(f, "extraction");
          const fs = factStats(f, "extraction", j);
          const topics = j?.topics || [];
          return `<tr><td><b>${esc(cityOf(f))}</b></td><td>${f.units.length}</td><td>${f.analysis ? retained(f).length : "–"}</td>
            <td style="min-width:220px">${j ? verdictStack(fs.counts, fs.required, undefined, false) + `<div class="cellnote">${fs.counts.covered || 0}/${fs.required} fully covered</div>` : "–"}</td>
            <td>${j ? `${topics.filter((t) => t.verdict === "covered").length}/${topics.length}` : "–"}</td></tr>`;
        }).join("")}</tbody></table></div>`;
  }

  function compareWriting() {
    const outcomes = ["transferred", "recovered", "lost_in_extraction", "lost_in_drafting"];
    const gapOrder = ["flagged", "partially_flagged", "not_flagged", "fabricated"];
    const raisedOrder = ["valid", "answerable_from_inputs", "answered_elsewhere", "unclear"];
    const row = (f) => {
      const j = judgmentOf(f, "chapter_writing");
      const transfer = f.stages.chapter_writing?.report?.details?.transfer || [];
      const tc = Object.fromEntries(outcomes.map((k) => [k, transfer.filter((t) => t.outcome === k).length]));
      const gc = Object.fromEntries(gapOrder.map((k) => [k, (j?.gaps || []).filter((g) => g.verdict === k).length]));
      const rc = Object.fromEntries(raisedOrder.map((k) => [k, (j?.flagged_gaps || []).filter((g) => g.verdict === k).length]));
      const claims = j?.claims || [];
      return `<tr><td><b>${esc(cityOf(f))}</b>${stageStatus(f.stages.chapter_writing) === "error" ? `<div class="cellnote">unofficial</div>` : ""}</td>
        <td style="min-width:200px">${transfer.length ? verdictStack(tc, transfer.length, outcomes, false) + `<div class="cellnote">${outcomes.map((k) => `${tc[k]} ${label(k).toLowerCase()}`).join(" · ")}</div>` : "–"}</td>
        <td style="min-width:160px">${j ? verdictStack(gc, j.gaps.length, gapOrder, false) + `<div class="cellnote">${gc.flagged}/${j.gaps.length} flagged · ${gc.fabricated} invented</div>` : "–"}</td>
        <td style="min-width:160px">${j ? verdictStack(rc, j.flagged_gaps.length, raisedOrder, false) + `<div class="cellnote">${rc.valid}/${j.flagged_gaps.length} genuine</div>` : "–"}</td>
        <td>${j ? `${claims.filter((c) => claimStatus(c, "chapter_writing") === "good").length}/${claims.length}` : "–"}</td></tr>`;
    };
    const limit = D.config?.context_window_tokens ?? D.config?.full_text_max_tokens;
    return `<h2>Transfer and missing information, side by side</h2>
      <p class="sub"><b>Recovered</b> facts were missed by extraction but used anyway because the drafter also receives the full source text, which masks extraction losses downstream.
      ${limit ? `That only happens while the request fits in ${limit.toLocaleString()} tokens; above it the drafter sees just the summary and the kept quotations, so extraction losses would carry into the application.` : ""}</p>
      <div class="card" style="padding:0;overflow-x:auto"><table>
        <thead><tr><th>Document</th><th>Extraction → draft transfer</th><th>Expected gaps</th><th>Gaps the drafter raised</th><th>Claims fully supported</th></tr></thead>
        <tbody>${D.fixtures.map(row).join("")}</tbody></table></div>`;
  }

  function compareVerification() {
    const kinds = [...new Set(D.fixtures.flatMap((f) => (f.golden.verification?.defects || []).map((d) => d.kind)))];
    return `<h2>Which kinds of defect the validator finds</h2>
      <p class="sub">Each badge is one seeded defect. Hover for what was changed.</p>
      <div class="card" style="padding:0;overflow-x:auto"><table>
        <thead><tr><th>Defect kind</th>${D.fixtures.map((f) => `<th>${esc(cityOf(f))}</th>`).join("")}</tr></thead>
        <tbody>${kinds.map((kind) => `<tr><td><b>${esc(kind.replace(/_/g, " "))}</b></td>${D.fixtures.map((f) => {
          const j = judgmentOf(f, "verification");
          const verdicts = Object.fromEntries((j?.defects || []).map((d) => [d.id, d.verdict]));
          const mine = (f.golden.verification?.defects || []).filter((d) => d.kind === kind);
          return `<td>${mine.map((d) => `<a href="#/f/${f.golden.fixture_id}/verification/sec-defects" data-tip="${esc(`<b>${esc(d.id)}</b>${esc(d.description)}`)}">${badge(verdicts[d.id] || "notrun", d.id)}</a>`).join("<br>") || `<span class="muted">–</span>`}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function compareEditing() {
    return `<h2>Edit cases by type</h2>
      <div class="card" style="padding:0;overflow-x:auto"><table>
        <thead><tr><th>Case type</th>${D.fixtures.map((f) => `<th>${esc(cityOf(f))}</th>`).join("")}</tr></thead>
        <tbody>${CASE_TYPES.map((type) => `<tr><td><b>${esc(type)}</b></td>${D.fixtures.map((f) => {
          const report = f.stages.editing?.report;
          const checks = Object.fromEntries((report?.details?.cases || []).map((c) => [c.case_id, c]));
          const failing = [...(report?.semantic_failures || []), ...(report?.integrity_failures || [])];
          const mine = (f.golden.editing?.cases || []).filter((c) => caseType(c) === type);
          return `<td>${mine.map((c) => {
            const ch = checks[c.id];
            const ok = ch && ch.outcome_ok && !failing.some((x) => x.startsWith(c.id));
            return `<a href="#/f/${f.golden.fixture_id}/editing/case-${esc(c.id)}" data-tip="${esc(`<b>${esc(c.id)}</b>“${esc(c.instruction)}”`)}">${badge(!ch ? "notrun" : ok ? "pass" : "fail", c.id)}</a>`;
          }).join("<br>") || `<span class="muted">–</span>`}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function examplesCard(stage, open = false) {
    const list = D.examples[stage] || [];
    return `<details class="card" ${open ? "open" : ""}><summary>${STAGES[stage].n} · ${esc(STAGES[stage].label)} judge · ${list.length} examples</summary>
      <div class="grid g2" style="margin-top:6px">${list.map((e) => {
        const verdict = e.verdict || e.claim_verdict || e.gap_verdict || e.flagged_gap_verdict || e.defect_verdict || e.finding_verdict || e.change_verdict || e.preserved_verdict || e.expected_change_verdict;
        const f = fixtureById(e.fixture);
        const href = e.unit && f ? refHref(e.fixture, stage, e.unit) : null;
        return `<div class="item" style="margin:0">
          <div class="spread"><span class="pill">${esc(f ? cityOf(f) : e.fixture)}</span>${STATUS[verdict] ? badge(verdict) : `<span class="pill">${esc(verdict || "")}</span>`}</div>
          ${e.source_passage ? `<div class="colhead" style="margin-top:10px">Passage extracted from the document</div>${href ? `<a class="quote gold" href="${href}">` : `<div class="quote gold">`}${esc(e.source_passage)}<span class="where">${esc(e.unit)}${href ? " →" : ""}</span>${href ? "</a>" : "</div>"}` : `<div class="muted small" style="margin-top:8px">No passage: the point is that no input contains the value.</div>`}
          ${e.instruction ? `<div class="colhead" style="margin-top:10px">Instruction</div><div class="quote">${esc(e.instruction)}</div>` : ""}
          ${e.seeded_defect ? `<div class="colhead" style="margin-top:10px">Seeded defect</div><div class="quote">${esc(e.seeded_defect)}</div>` : ""}
          ${e.output || e.finding || e.change ? `<div class="colhead" style="margin-top:10px">${e.finding ? "Validator finding" : e.change ? "Applied change" : "Output judged"}</div><div class="quote out">${esc(e.output || e.finding || e.change)}</div>` : ""}
          ${e.expected_fact ? `<div class="muted small" style="margin-top:6px">Expected fact: ${esc(e.expected_fact)}</div>` : ""}
          <div class="reason">${esc(e.reason)}</div>
        </div>`;
      }).join("")}</div>
    </details>`;
  }

  function lane(stage) {
    const step = (k, tag, title, body) => `<div class="step ${k}"><div class="tag">${tag}</div><b>${title}</b><span>${body}</span></div>`;
    const ar = `<div class="arrow" aria-hidden="true">→</div>`;
    const steps = {
      extraction: [
        step("py", "fixture", "Original document", "Pinned <code>source.md</code> with page or heading anchors"),
        step("llm", "production LLM", "Source analysis", "Reader + synthesizer quote and label the document"),
        step("", "output", "Retained quotes + topics", "The summary is saved but <b>withheld</b> from the judge"),
        step("py", "python", "Integrity", "Exact substring at a valid locator"),
        step("judge", "LLM judge", "Semantic judgment", "Facts → quotes · topics → labels · quotes → full source"),
      ],
      chapter_writing: [
        step("", "input", "This run's extraction", "Plus full source text, template and city context"),
        step("llm", "production LLM", "Chapter drafter", "Chapter by chapter, seeing all earlier chapters"),
        step("", "output", "Chapters + gaps", "<code>[Information needed]</code> markers and structured gaps"),
        step("py", "python", "Integrity + transfer", "Chapter IDs · marker/gap parity · extraction → draft"),
        step("judge", "LLM judge", "Semantic judgment", "Facts · claims · chapters · expected and raised gaps"),
      ],
      verification: [
        step("py", "fixture", "Reference draft", "Reviewed production draft, frozen"),
        step("py", "python", "Seed defects", "Exact, unique edits that keep marker/gap parity"),
        step("llm", "production LLM", "Chapter validator", "Completeness + consistency pass per chapter"),
        step("py", "python", "Separate findings", "Open-gap findings are policy-owned"),
        step("judge", "LLM judge", "Semantic judgment", "Defect detected? · other findings valid or false alarms"),
      ],
      editing: [
        step("py", "fixture", "Reference draft + request", "Fill · propagate · rewrite · ask without a value"),
        step("llm", "production LLM", "Edit planner", "Exact-anchor tools + independent semantic review"),
        step("py", "python", "Validate + apply", "Production plan validation and anchor replacement"),
        step("py", "python", "Scope checks", "Outcome · chapters changed · markers removed"),
        step("judge", "LLM judge", "Semantic judgment", "Expected changes · preserved facts · authority · consistency"),
      ],
    }[stage];
    return `<div class="flow">${steps.join(ar)}</div>`;
  }

  // ---------- fixture pages ----------
  function fixturePage(f, tab) {
    const fid = f.golden.fixture_id;
    const g = f.golden;
    const tabs = [
      ["golden", "Golden set", null],
      ...fixtureStages(f).map((s) => [s, `${STAGES[s].n} · ${STAGES[s].label}`, stageStatus(f.stages[s])]),
      ["source", "Source document", null],
      ...(f.reference_draft ? [["reference", "Reference draft", null]] : []),
      ...(f.drafting_input ? [["input", "Application input", null]] : []),
    ];
    const body = { golden: goldenTab, extraction: extractionTab, chapter_writing: writingTab, verification: verificationTab, editing: editingTab, source: sourceTab, reference: referenceTab, input: inputTab }[tab](f);
    return `
      <div class="eyebrow">Document · <span class="mono">${esc(fid)}</span></div>
      <h1>${esc(g.source.source_label)}</h1>
      <p class="lede">${esc(g.description)}</p>
      <div class="row" style="margin-top:14px">
        <span class="pill">${esc(g.source.language.toUpperCase())}</span>
        <span class="pill">${esc(g.source.source_format.toUpperCase())}</span>
        <span class="pill">${g.source.page_count ? `${g.source.page_count} pages` : `${f.units.length} blocks`}</span>
        <span class="pill mono">sha256 ${esc(short(g.source.sha256, 12))}</span>
        <span class="pill">${esc(g.source.filename)}</span>
        ${f.pdf ? `<a class="pill" href="${esc(f.pdf)}" target="_blank" rel="noopener">Open original PDF ↗</a>` : ""}
      </div>
      <p class="muted small" style="max-width:110ch;margin-top:10px">${esc(g.source.provenance)}</p>
      <nav class="tabs">${tabs.map(([k, text, st]) => `<a href="#/f/${fid}/${k}" class="${k === tab ? "active" : ""}">${st ? `<span class="mini" style="background:var(--${cls(st)})" aria-hidden="true"></span>` : ""}${esc(text)}</a>`).join("")}</nav>
      ${body}`;
  }

  function stageHeader(f, stage, tiles) {
    const st = f.stages[stage];
    const r = st?.report;
    const status = stageStatus(st);
    const lists = [];
    if (r?.evaluation_errors?.length) lists.push(["err", "Evaluation errors, so the judgment could not be trusted", r.evaluation_errors]);
    if (r?.integrity_failures?.length) lists.push(["bad", "Integrity failures", r.integrity_failures]);
    if (r?.semantic_failures?.length) lists.push(["bad", "Semantic failures", r.semantic_failures]);
    const invalid = status === "error" && r?.judgment;
    return `
      <div class="spread" style="margin-bottom:6px">
        <div><div class="eyebrow">Stage ${STAGES[stage].n} · ${esc(STAGES[stage].what)}</div><h2 style="margin:0">${esc(STAGES[stage].label)} result</h2>
          <div class="muted small">run <span class="mono">${esc(D.run.id)}</span> · ${esc(D.run.generated_at ? new Date(D.run.generated_at).toLocaleString() : "")}</div></div>
        ${bigBadge(status)}
      </div>
      ${invalid ? `<div class="callout err" style="margin:14px 0"><b>Python rejected this judgment, so no official metrics exist.</b><div class="small muted" style="margin-top:4px">Numbers below come from the raw judge output and are for review only.</div></div>` : ""}
      <div class="grid g4" style="margin-top:14px;${invalid ? "opacity:.6" : ""}">${tiles.map((t) => `<div class="card">${t}</div>`).join("")}</div>
      <div style="margin-top:14px">${lists.length
        ? lists.map(([k, title, items]) => `<details class="callout ${k}" style="margin-top:10px" ${items.length <= 6 ? "open" : ""}><summary><b>${esc(title)} (${items.length})</b></summary><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`).join("")
        : r ? `<div class="callout ok"><b>All gates passed.</b></div>` : ""}</div>`;
  }

  const toolbar = (id) => `<div class="toolbar"><label><input type="checkbox" data-filter="${id}"> Show only problems</label></div>`;
  const jump = (fid, stage, items) => `<div class="row small" style="margin:22px 0 0;color:var(--ink-2)">Jump to: ${items.map(([id, text]) => `<a href="#/f/${fid}/${stage}/${id}">${esc(text)}</a>`).join(" · ")}</div>`;
  function notRun(f, stage) {
    const errs = f.stages[stage]?.report?.evaluation_errors || [];
    return `<div class="callout err" style="margin-top:20px"><b>No judgment for this stage yet.</b>${errs.length ? `<ul>${errs.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : `<div class="muted small">Run the evaluator with <code>--stage ${stage}</code> and rebuild the site.</div>`}</div>`;
  }
  const legendClaims = () => `<div class="legend" style="margin:0 0 12px">${["good", "warning", "serious", "critical", "neutral"].map((s) =>
    `<span><i style="background:color-mix(in srgb, var(--${s}) 40%, transparent)"></i>${{ good: "Supported & clear", warning: "Partial / lacks context", serious: "Unsupported", critical: "Contradicted", neutral: "Uncertain" }[s]}</span>`).join("")}<span><i class="marker-sw"></i>[Information needed] marker</span></div>`;

  function claimItem(f, stage, c, k) {
    const s = claimStatus(c, stage);
    const writing = stage !== "extraction";
    return `<div class="item ${s === "good" ? "ok" : ""}" id="cl-${k}">
      <div class="item-head"><div class="row">${badge(c.verdict, writing ? `${label(c.verdict)} · original` : undefined)}
        ${writing ? badge(c.supplied_verdict || "uncertain", `${label(c.supplied_verdict)} · supplied`) : ""}
        ${badge(c.self_contained ? "clear" : "unclear")}</div></div>
      <div class="cols">
        <div><div class="colhead">Output claim</div>${quote(f, stage, c.output, "out")}</div>
        <div><div class="colhead">Evidence in original source / context</div>${quotes(f, stage, c.evidence, "gold", "No evidence cited")}
          ${writing ? `<div class="colhead" style="margin-top:10px">Evidence actually supplied to the drafter</div>${quotes(f, stage, c.supplied_evidence, "", "No supplied evidence cited")}` : ""}</div>
      </div>
      <div class="reason">${esc(c.reason)}</div>
    </div>`;
  }
  const contradiction = (f, stage) => (c) => `<div class="item"><div class="item-head">${badge("contradicted")}</div>
    <div style="margin-top:10px">${quotes(f, stage, c.output_refs, "out")}</div><div class="reason">${esc(c.reason)}</div></div>`;

  // ----- golden tab -----
  function goldenTab(f) {
    const g = f.golden;
    const fid = g.fixture_id;
    const ev = (e) => {
      const u = unitForText(f, e.text);
      const loc = e.locators.map((l) => (l.page ? `page ${l.page}` : l.heading)).join(" or ");
      const href = u ? `#/f/${fid}/source/${enc("u-" + u.anchor)}` : null;
      const inner = `${esc(e.text)}<span class="where">allowed locator: ${esc(loc)}${href ? " →" : ""}</span>`;
      return href ? `<a class="quote gold" href="${href}">${inner}</a>` : `<div class="quote gold">${inner}</div>`;
    };
    const req = (r) => `<span class="pill ${r ? "req" : ""}">${r ? "required" : "optional"}</span>`;
    const chapters = (refs) => (refs.length ? refs : ["any chapter"]).map((c) => `<span class="pill">→ ${esc(c === "any chapter" ? c : chapterTitle(f, c))}</span>`).join("");
    const w = g.chapter_writing, v = g.verification, e = g.editing;
    return `
      <p class="sub">Golden expectations are <b>coverage targets, not evidence</b>. Truth comes only from the original document and authoritative context. No keyword lists, no reference answers: just semantic statements with stable IDs.</p>
      <div class="row small" style="color:var(--ink-2)">Jump to: <a href="#/f/${fid}/golden/g-ex">1 Extraction facts</a> · <a href="#/f/${fid}/golden/g-cw">2 Chapter writing</a> · <a href="#/f/${fid}/golden/g-ve">3 Seeded defects</a> · <a href="#/f/${fid}/golden/g-ed">4 Edit cases</a></div>
      <h2 id="g-ex">1 · Extraction facts <span class="muted small">(${g.extraction.facts.length})</span></h2>
      <p class="sub">What the retained quotations must preserve, with exact evidence and allowed locators. Gate: ≥ ${pct(g.extraction.thresholds.min_required_fact_coverage)} of required facts fully covered; topics ≥ ${pct(g.extraction.thresholds.min_topic_coverage)}.</p>
      ${g.extraction.facts.map((x) => `<div class="item"><div class="item-head"><div class="stmt">${esc(x.statement)}</div>${req(x.required)}</div>
        <div class="fid">${esc(x.id)}</div><div style="margin-top:10px">${x.evidence.map(ev).join("")}</div></div>`).join("")}
      <h3 style="margin-top:22px">Topics</h3>
      <div class="grid g3" style="margin-top:10px">${g.extraction.topics.map((t) => `<div class="item" style="margin:0"><div class="stmt">${esc(t.statement)}</div><div class="fid">${esc(t.id)}</div></div>`).join("")}</div>
      ${w ? `
      <h2 id="g-cw">2 · Chapter writing <span class="muted small">(${w.facts.length} facts · ${w.gaps.length} expected gaps)</span></h2>
      <p class="sub">Facts the application must carry into allowed chapters. A link to an extraction fact lets the report tell extraction losses from drafting losses. Gate: facts ≥ ${pct(w.thresholds.min_required_fact_coverage)}, gaps flagged ≥ ${pct(w.thresholds.min_gap_recall)}.</p>
      ${w.facts.map((x) => `<div class="item"><div class="item-head"><div class="stmt">${esc(x.statement)}</div>${req(x.required)}</div>
        <div class="row" style="margin-top:8px"><span class="fid">${esc(x.id)}</span><span class="pill">origin: ${esc(x.origin.replace(/_/g, " "))}</span>${x.extraction_fact ? `<span class="pill">← extraction: ${esc(x.extraction_fact)}</span>` : ""}${chapters(x.chapters)}</div></div>`).join("")}
      <h3 style="margin-top:22px">Expected gaps: information no input supplies</h3>
      <p class="sub">The drafter must flag each with an <code>[Information needed: …]</code> marker instead of inventing a value.</p>
      ${w.gaps.map((x) => `<div class="item"><div class="item-head"><div class="stmt">${esc(x.statement)}</div>${req(x.required)}</div>
        <div class="row" style="margin-top:8px"><span class="fid">${esc(x.id)}</span>${chapters(x.chapters)}</div></div>`).join("")}` : ""}
      ${v ? `
      <h2 id="g-ve">3 · Seeded defects <span class="muted small">(${v.defects.length})</span></h2>
      <p class="sub">Exact, unique edits applied to the reference draft. Gate: ≥ ${pct(v.thresholds.min_defect_recall)} detected; false alarms ≤ ${pct(v.thresholds.max_false_alarm_rate)} of model findings.</p>
      ${v.defects.map(defectSpec(f)).join("")}` : ""}
      ${e ? `
      <h2 id="g-ed">4 · Edit cases <span class="muted small">(${e.cases.length})</span></h2>
      ${e.cases.map((c) => `<div class="item"><div class="item-head"><div class="stmt">“${esc(c.instruction)}”</div><span class="pill req">expects ${esc(c.expected_outcome)}</span></div>
        <div class="row" style="margin-top:8px"><span class="fid">${esc(c.id)}</span>${c.allowed_chapters.map((r) => `<span class="pill">may change: ${esc(chapterTitle(f, r))}</span>`).join("")}</div>
        <div class="cols">
          <div><div class="colhead">Must change</div>${c.expected_changes.map((x) => `<div class="quote out">${esc(x.statement)}</div>`).join("") || `<div class="empty">Nothing; the pipeline should ask for the value.</div>`}</div>
          <div><div class="colhead">Must survive</div>${c.must_preserve.map((x) => `<div class="quote gold">${esc(x.statement)}</div>`).join("") || `<div class="empty">–</div>`}</div>
        </div></div>`).join("")}` : ""}`;
  }
  const defectSpec = (f) => (d) => `<div class="item"><div class="item-head"><div class="stmt">${esc(d.description)}</div><span class="pill">${esc(d.kind.replace(/_/g, " "))}</span></div>
    <div class="row" style="margin-top:8px"><span class="fid">${esc(d.id)}</span>${d.expected_chapters.map((r) => `<span class="pill">${esc(chapterTitle(f, r))}</span>`).join("")}<span class="pill">expects: ${esc(d.expected_categories.join(" / "))}</span></div>
    ${d.edits.map((e) => `<div class="diff"><div class="colhead">${esc(chapterTitle(f, e.chapter_ref))}</div><del>${esc(e.find)}</del><ins>${esc(e.replace) || "<i>(deleted)</i>"}</ins></div>`).join("")}
    ${d.remove_gaps.map((r) => `<div class="muted small">Removes open gap <code>${esc(r.field_key)}</code> from ${esc(chapterTitle(f, r.chapter_ref))}</div>`).join("")}
    ${d.add_gaps.map((r) => `<div class="muted small">Adds open gap <code>${esc(r.gap.field_key)}</code> to ${esc(chapterTitle(f, r.chapter_ref))}</div>`).join("")}</div>`;

  // ----- stage 1: extraction -----
  function extractionTab(f) {
    const stage = "extraction";
    const j = judgmentOf(f, stage);
    const a = f.analysis;
    const fid = f.golden.fixture_id;
    if (!j && !a) return notRun(f, stage);
    const golden = Object.fromEntries(f.golden.extraction.facts.map((x) => [x.id, x]));
    const topics = Object.fromEntries(f.golden.extraction.topics.map((x) => [x.id, x]));
    const th = f.golden.extraction.thresholds;
    const fs = factStats(f, stage, j);
    const topicRate = j ? j.topics.filter((t) => t.verdict === "covered").length / (j.topics.length || 1) : null;
    const clean = j ? j.claims.filter((c) => claimStatus(c, stage) === "good").length : 0;
    const head = j ? stageHeader(f, stage, [
      meter(fs.coverage, th.min_required_fact_coverage, "Required facts retained") + verdictStack(fs.counts, fs.required),
      meter(topicRate, th.min_topic_coverage, "Expected topics conveyed"),
      countTile(clean, j.claims.length, "Retained claims supported & clear", "Each quotation checked against the complete document"),
      plainTile(retained(f).length, "Quotations retained", `from ${f.units.length} source units · ${a?.topics?.length ?? 0} topic labels`),
    ]) : "";
    const spans = {};
    (j?.claims || []).forEach((c, k) => {
      (spans[c.output.unit_id] ||= []).push({ quote: c.output.quote, status: claimStatus(c, stage), go: `cl-${k}`,
        tip: `<b>${esc(label(c.verdict))}${c.self_contained ? "" : " · lacks context"}</b>${esc(c.reason)}` });
    });
    const excerpts = retained(f).map(({ key, label: name, e }) => {
      const anchor = e.anchor || (e.page ? `page-${e.page}` : "");
      return `<div class="item" id="ex-${esc(key)}">
        <div class="spread"><span class="fid">${esc(name)}</span><a class="small" href="#/f/${fid}/source/${enc("u-" + anchor)}">${esc(e.page ? `page ${e.page}` : anchor)} →</a></div>
        <div class="doc" style="margin-top:6px">${highlightMd(e.text, spans[`retained/${key}/${anchor}`] || [])}</div></div>`;
    }).join("");
    return `${head}
      ${jump(fid, stage, [["sec-facts", "Facts"], ["sec-topics", "Topics"], ["sec-claims", "Claims"], ["sec-output", "LLM output"]])}
      ${j ? `
      <h2 id="sec-facts">Expected facts → retained quotations</h2>
      <p class="sub">Do the quotations kept by extraction preserve each fact? Facts present only in the unretained document do <b>not</b> count.</p>
      ${toolbar("facts")}
      <div id="list-facts">${j.facts.map((v) => {
        const gf = golden[v.id] || {};
        return `<div class="item ${v.verdict === "covered" ? "ok" : ""}">
          <div class="item-head">${badge(v.verdict)}<div class="stmt">${esc(gf.statement || v.id)}</div><span class="pill ${gf.required ? "req" : ""}">${gf.required ? "required" : "optional"}</span></div>
          <div class="fid">${esc(v.id)}</div>
          <div class="cols"><div><div class="colhead">Golden evidence in source</div>${(gf.evidence || []).map((e) => `<div class="quote gold">${esc(e.text)}</div>`).join("")}</div>
          <div><div class="colhead">What the LLM retained (cited by judge)</div>${quotes(f, stage, v.output_refs, "out", "Nothing retained")}</div></div>
          <div class="reason">${esc(v.reason)}</div></div>`;
      }).join("")}</div>
      <h2 id="sec-topics">Expected topics → topic labels</h2>
      <p class="sub">Returned labels: <span class="chips" style="display:inline-flex">${(a?.topics || []).map((t, i) => `<span class="chip" id="tp-${i}">${esc(t)}</span>`).join("")}</span></p>
      <div class="grid g2">${j.topics.map((v) => `<div class="item ${v.verdict === "covered" ? "ok" : ""}" style="margin:0">
        <div class="item-head">${badge(v.verdict)}<div class="stmt">${esc(topics[v.id]?.statement || v.id)}</div></div>
        <div class="chips" style="margin-top:8px">${v.output_refs.map((r) => `<span class="chip">${esc(r.quote)}</span>`).join("") || `<span class="empty">No label cited</span>`}</div>
        <div class="reason">${esc(v.reason)}</div></div>`).join("")}</div>
      <h2 id="sec-claims">Retained quotations → original source</h2>
      <p class="sub">An authentic quotation can still mislead by losing a qualifier.</p>
      ${toolbar("claims")}
      <div id="list-claims">${j.claims.map((c, k) => claimItem(f, stage, c, k)).join("")}</div>
      ${j.contradictions.length ? `<h2>Contradictions</h2>${j.contradictions.map(contradiction(f, stage)).join("")}` : ""}` : notRun(f, stage)}
      <h2 id="sec-output">LLM output · what extraction produced</h2>
      <p class="sub">Raw production analysis. Highlights mark claims the judge assessed; hover for the verdict, click to jump.</p>
      ${legendClaims()}
      ${excerpts || `<div class="empty">No analysis output</div>`}
      <details class="card" style="margin-top:14px"><summary>Generated summary: saved for diagnosis, never sent to the judge</summary><div class="doc muted">${esc(a?.summary || "")}</div></details>`;
  }

  // ----- stage 2: chapter writing -----
  // What the production support check changed (or declined to change) after drafting.
  function supportCheck(records) {
    if (!records?.length) return "";
    const applied = records.filter((r) => r.applied).length;
    return `<details style="margin-top:10px"><summary>Support check: ${applied} correction${applied === 1 ? "" : "s"} applied${records.length > applied ? `, ${records.length - applied} skipped` : ""}</summary>
      ${records.map((r) => `<div class="item" style="margin-top:8px">
        <div class="small muted">${r.applied ? "Applied" : `Skipped: ${esc(r.skipped)}`} · ${esc(r.reason)}</div>
        <div class="quote bad">${esc(r.before)}</div><div class="quote out">${esc(r.after) || "<i>removed</i>"}</div></div>`).join("")}
    </details>`;
  }

  function writingTab(f) {
    const stage = "chapter_writing";
    const st = f.stages[stage];
    const j = judgmentOf(f, stage);
    const drafts = st?.drafts || [];
    const fid = f.golden.fixture_id;
    if (!j && !drafts.length) return notRun(f, stage);
    const g = f.golden.chapter_writing;
    const golden = Object.fromEntries(g.facts.map((x) => [x.id, x]));
    const gaps = Object.fromEntries(g.gaps.map((x) => [x.id, x]));
    const schema = Object.fromEntries(f.drafting_input.chapter_schema.map((c) => [c.chapter_ref, c]));
    const m = metricsOf(f, stage);
    const fs = factStats(f, stage, j);
    const raised = j?.flagged_gaps || [];
    const head = j ? stageHeader(f, stage, [
      meter(fs.coverage, g.thresholds.min_required_fact_coverage, "Required facts in allowed chapters") + verdictStack(fs.counts, fs.required),
      meter(m.gap_recall ?? null, g.thresholds.min_gap_recall, "Expected gaps flagged") + verdictStack(
        Object.fromEntries(["flagged", "partially_flagged", "not_flagged", "fabricated"].map((k) => [k, m[`required_gaps_${k}`] || 0])),
        g.gaps.filter((x) => x.required).length, ["flagged", "partially_flagged", "not_flagged", "fabricated"]),
      countTile(raised.filter((x) => x.verdict === "valid").length, raised.length, "Raised gaps genuinely missing", "not answerable from inputs, not answered in another chapter"),
      countTile(j.claims.filter((c) => claimStatus(c, stage) === "good").length, j.claims.length, "Claims supported (source + drafter input)", `${j.chapters.filter((c) => c.verdict === "satisfied").length}/${j.chapters.length} chapters answer their question`),
    ]) : "";

    const transfer = st?.report?.details?.transfer || [];
    const claimSpans = {};
    (j?.claims || []).forEach((c, k) => {
      (claimSpans[c.output.unit_id] ||= []).push({ quote: c.output.quote, status: claimStatus(c, stage), go: `cl-${k}`,
        tip: `<b>Original: ${esc(label(c.verdict))} · Supplied: ${esc(label(c.supplied_verdict))}${c.self_contained ? "" : " · lacks context"}</b>${esc(c.reason)}` });
    });
    const raisedById = Object.fromEntries(raised.map((x) => [x.unit_id, x]));
    const chJ = Object.fromEntries((j?.chapters || []).map((c) => [c.chapter_ref, c]));
    const byChapter = {};
    (j?.claims || []).forEach((c, k) => (byChapter[c.output.unit_id.replace(/^chapter\//, "")] ||= []).push([c, k]));

    const chaptersOut = drafts.map((d) => {
      const cj = chJ[d.chapter_ref];
      const gapTip = (marker) => {
        const gap = d.gaps.find((x) => marker.includes(x.question.slice(0, 40)));
        const verdict = gap && raisedById[`gap/${d.chapter_ref}/${gap.field_key}`];
        return `<b>Missing-information marker${verdict ? ` · ${esc(label(verdict.verdict))}` : ""}</b>${esc(verdict?.reason || "")}`;
      };
      return `<div class="card chapter" id="ch-${esc(d.chapter_ref)}">
        <div class="spread"><div><div class="eyebrow">${esc(d.chapter_ref)}</div><h3 style="font-size:17px">${esc(chapterTitle(f, d.chapter_ref))}</h3></div>${cj ? badge(cj.verdict) : ""}</div>
        <div class="doc" style="margin-top:8px">${highlightMd(d.body_markdown, [...(claimSpans[`chapter/${d.chapter_ref}`] || []), ...markerSpans(d.body_markdown, gapTip)])}</div>
        ${supportCheck(d.support_check)}
      </div>`;
    }).join("");

    return `${head}
      ${jump(fid, stage, [["sec-transfer", "Transfer"], ["sec-gaps", "Expected gaps"], ["sec-raised", "Raised gaps"], ["sec-facts", "Facts"], ["sec-chapters", "Chapters"], ["sec-claims", "Claims"], ["sec-output", "Generated application"]])}
      ${j ? `
      <h2 id="sec-transfer">Extraction → draft: where facts survive or are lost</h2>
      <p class="sub">For each document fact linked to an extraction fact: did extraction keep it, and did the drafter carry it into an allowed chapter? <b>Recovered</b> means extraction missed it but the drafter used the full source text anyway.</p>
      <div class="card" style="padding:0"><table>
        <thead><tr><th>Draft fact</th><th>1 · Extraction</th><th>2 · Draft</th><th>Outcome</th></tr></thead>
        <tbody>${transfer.map((r) => `<tr><td>${esc(golden[r.fact]?.statement || r.fact)}<div class="fid">${esc(r.fact)} ← ${esc(r.extraction_fact)}</div></td>
          <td>${r.extraction_verdict ? badge(r.extraction_verdict) : "–"}</td><td>${r.draft_verdict ? badge(r.draft_verdict) : "–"}</td><td>${badge(r.outcome)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No transfer data (extraction judgment unavailable).</td></tr>`}</tbody>
      </table></div>

      <h2 id="sec-gaps">Expected gaps → draft</h2>
      <p class="sub">Information the application needs that <b>no input</b> supplies. The draft must flag it, not fill it.</p>
      ${toolbar("gaps")}
      <div id="list-gaps">${j.gaps.map((v) => `<div class="item ${v.verdict === "flagged" ? "ok" : ""}">
        <div class="item-head">${badge(v.verdict)}<div class="stmt">${esc(gaps[v.id]?.statement || v.id)}</div><span class="pill ${gaps[v.id]?.required ? "req" : ""}">${gaps[v.id]?.required ? "required" : "optional"}</span></div>
        <div class="row" style="margin-top:6px"><span class="fid">${esc(v.id)}</span>${(gaps[v.id]?.chapters || []).map((c) => `<span class="pill">→ ${esc(chapterTitle(f, c))}</span>`).join("")}</div>
        <div style="margin-top:10px"><div class="colhead">${v.verdict === "fabricated" ? "Invented statement" : "Where the draft flags it"}</div>${quotes(f, stage, v.output_refs, "out", "Not flagged anywhere")}</div>
        <div class="reason">${esc(v.reason)}</div></div>`).join("")}</div>

      <h2 id="sec-raised">Gaps the drafter raised <span class="muted small">(${raised.length})</span></h2>
      <p class="sub">Every structured gap: genuinely missing? Or could it be answered from the inputs, or does another chapter already state it?</p>
      ${toolbar("raised")}
      <div id="list-raised">${drafts.flatMap((d) => d.gaps.map((gap) => {
        const unit = `gap/${d.chapter_ref}/${gap.field_key}`;
        const v = raisedById[unit];
        return `<div class="item ${v?.verdict === "valid" ? "ok" : ""}" id="rg-${esc(d.chapter_ref)}-${esc(gap.field_key)}">
          <div class="item-head">${v ? badge(v.verdict) : ""}<div class="stmt">${esc(gap.question)}</div><span class="pill ${gap.severity === "critical" ? "req" : ""}">${esc(gap.severity)}</span></div>
          <div class="row" style="margin-top:6px"><span class="fid">${esc(gap.field_key)}</span><span class="pill">${esc(chapterTitle(f, d.chapter_ref))}</span></div>
          <div class="muted small" style="margin-top:6px">Why asking: ${esc(gap.why_asking)}</div>
          ${v?.evidence?.length ? `<div style="margin-top:10px"><div class="colhead">Answer found in</div>${quotes(f, stage, v.evidence, "gold")}</div>` : ""}
          ${v ? `<div class="reason">${esc(v.reason)}</div>` : ""}</div>`;
      })).join("") || `<div class="empty">No gaps raised.</div>`}</div>

      <h2 id="sec-facts">Expected facts → chapters</h2>
      ${toolbar("facts")}
      <div id="list-facts">${j.facts.map((v) => {
        const gf = golden[v.id] || {};
        return `<div class="item ${v.verdict === "covered" ? "ok" : ""}">
          <div class="item-head">${badge(v.verdict)}<div class="stmt">${esc(gf.statement || v.id)}</div><span class="pill ${gf.required ? "req" : ""}">${gf.required ? "required" : "optional"}</span></div>
          <div class="row" style="margin-top:6px"><span class="fid">${esc(v.id)}</span><span class="pill">origin: ${esc((gf.origin || "").replace(/_/g, " "))}</span>${(gf.chapters?.length ? gf.chapters : ["any"]).map((c) => `<span class="pill">→ ${esc(c === "any" ? "any chapter" : chapterTitle(f, c))}</span>`).join("")}</div>
          <div style="margin-top:10px"><div class="colhead">Where the draft says it</div>${quotes(f, stage, v.output_refs, "out", "Not found in the draft")}</div>
          <div class="reason">${esc(v.reason)}</div></div>`;
      }).join("")}</div>

      <h2 id="sec-chapters">Chapter requirements</h2>
      <p class="sub">Answering with all available evidence and flagging only what is genuinely unavailable counts as <b>satisfied</b>.</p>
      ${toolbar("chapters")}
      <div id="list-chapters">${j.chapters.map((c) => `<div class="item ${c.verdict === "satisfied" ? "ok" : ""}">
        <div class="item-head">${badge(c.verdict)}<div class="stmt">${esc(chapterTitle(f, c.chapter_ref))}</div></div>
        <div class="muted small" style="margin-top:4px">Asks for: ${esc(schema[c.chapter_ref]?.description || "")}</div>
        <div style="margin-top:10px">${quotes(f, stage, c.output_refs, "out", "No passage cited")}</div>
        <div class="reason">${esc(c.reason)}</div></div>`).join("")}</div>

      <h2 id="sec-claims">Draft claims → evidence <span class="muted small">(${j.claims.length})</span></h2>
      <p class="sub">Two verdicts per claim: against the <b>complete original source and context</b>, and against the evidence <b>actually supplied to that chapter</b>.</p>
      ${toolbar("claims")}
      <div id="list-claims">${Object.entries(byChapter).map(([ref, items]) => `<h3 style="margin:22px 0 10px">${esc(chapterTitle(f, ref))} <span class="muted small">(${items.length})</span></h3>${items.map(([c, k]) => claimItem(f, stage, c, k)).join("")}`).join("")}</div>
      ${j.contradictions.length ? `<h2>Contradictions between chapters</h2>${j.contradictions.map(contradiction(f, stage)).join("")}` : ""}` : notRun(f, stage)}

      <h2 id="sec-output">LLM output · the generated application</h2>
      <p class="sub">Chapters exactly as the production drafter wrote them for <b>${esc(f.drafting_input.funder)}</b>: ${esc(f.drafting_input.opportunity)}.</p>
      ${legendClaims()}
      ${chaptersOut || `<div class="empty">No drafts produced</div>`}`;
  }

  // ----- stage 3: verification -----
  function verificationTab(f) {
    const stage = "verification";
    const st = f.stages[stage];
    const j = judgmentOf(f, stage);
    const fid = f.golden.fixture_id;
    const g = f.golden.verification;
    if (!st) return `${notRun(f, stage)}<h2>Seeded defects</h2>${g.defects.map(defectSpec(f)).join("")}`;
    const m = metricsOf(f, stage);
    const records = st.findings || st.report?.details?.findings || [];
    const byUnit = Object.fromEntries(records.map((r) => [r.unit_id, r]));
    const checks = Object.fromEntries((st.report?.details?.defect_checks || []).map((c) => [c.defect, c]));
    const statuses = st.report?.details?.chapter_status || {};
    const head = j ? stageHeader(f, stage, [
      meter(m.defect_recall ?? null, g.thresholds.min_defect_recall, "Seeded defects detected") + verdictStack(
        Object.fromEntries(["detected", "partially_detected", "missed"].map((k) => [k, j.defects.filter((d) => d.verdict === k).length])),
        j.defects.length, ["detected", "partially_detected", "missed"]),
      plainTile(pct(m.strict_defect_recall), "Strict detection", "a cited finding also uses an expected category and names every expected chapter"),
      meter(m.false_alarm_rate ?? null, g.thresholds.max_false_alarm_rate, "False alarms among other model findings", true),
      plainTile(`${m.model_findings ?? 0} + ${m.open_gap_findings ?? 0}`, "Model + open-gap findings", "open-gap findings come from persisted gaps, not the model"),
    ]) : "";
    const defects = Object.fromEntries(g.defects.map((d) => [d.id, d]));
    const findingCard = (r, verdictItem) => `<div class="item ${verdictItem?.verdict === "valid" ? "ok" : ""}" id="fd-${r.unit_id.split("/")[1]}">
      <div class="item-head">${verdictItem ? badge(verdictItem.verdict) : `<span class="pill">matched to a defect</span>`}<div class="stmt">${esc(r.message)}</div><span class="pill">${esc(r.category.replace(/_/g, " "))} · ${esc(r.severity)}</span></div>
      <div class="row" style="margin-top:6px"><span class="fid">${esc(r.unit_id)}</span><span class="pill">validated: ${esc(chapterTitle(f, r.target_chapter))}</span>${r.chapters.map((c) => `<span class="pill">involves ${esc(chapterTitle(f, c))}</span>`).join("")}</div>
      <div class="muted small" style="margin-top:6px">Suggested action: ${esc(r.suggested_action)}</div>
      ${r.excerpts.map((x) => `<div class="quote" style="margin-top:6px">${esc(x)}</div>`).join("")}
      ${verdictItem?.evidence?.length ? `<div style="margin-top:8px"><div class="colhead">Evidence</div>${quotes(f, stage, verdictItem.evidence, "gold")}</div>` : ""}
      ${verdictItem ? `<div class="reason">${esc(verdictItem.reason)}</div>` : ""}</div>`;
    const seededSpans = (ref) => g.defects.flatMap((d) => d.edits.filter((e) => e.chapter_ref === ref && e.replace).map((e) => ({ quote: e.replace, cls: "seeded", tip: `<b>Seeded defect · ${esc(d.id)}</b>${esc(d.description)}` })));
    return `${head}
      <div class="row small" style="margin-top:14px">${Object.entries(statuses).map(([ref, s]) => `<span class="pill">${esc(chapterTitle(f, ref))}: ${esc(label(s))}</span>`).join("")}</div>
      ${jump(fid, stage, [["sec-defects", "Seeded defects"], ["sec-findings", "Other findings"], ["sec-seeded", "Seeded draft"]])}
      ${j ? `
      <h2 id="sec-defects">Seeded defects → validator findings</h2>
      <p class="sub">Did the production validator find each injected problem? Findings are matched by meaning; the strict check also requires an expected category and every expected chapter.</p>
      ${toolbar("defects")}
      <div id="list-defects">${j.defects.map((v) => {
        const d = defects[v.id] || {};
        return `<div class="item ${v.verdict === "detected" ? "ok" : ""}">
          <div class="item-head">${badge(v.verdict)}<div class="stmt">${esc(d.description || v.id)}</div><span class="pill">${esc((d.kind || "").replace(/_/g, " "))}</span></div>
          <div class="row" style="margin-top:6px"><span class="fid">${esc(v.id)}</span>${checks[v.id] ? (checks[v.id].category_and_chapters_match ? badge("pass", "Category & chapters match") : badge("unclear", "Category or chapters differ")) : ""}</div>
          ${(d.edits || []).map((e) => `<div class="diff"><div class="colhead">${esc(chapterTitle(f, e.chapter_ref))}</div><del>${esc(e.find)}</del><ins>${esc(e.replace) || "<i>(deleted)</i>"}</ins></div>`).join("")}
          <div style="margin-top:10px"><div class="colhead">Findings that identify it</div>${quotes(f, stage, v.finding_refs, "out", "No finding identifies this defect")}</div>
          <div class="reason">${esc(v.reason)}</div></div>`;
      }).join("")}</div>
      <h2 id="sec-findings">Other model findings <span class="muted small">(${j.findings.length})</span></h2>
      <p class="sub">Findings that match no seeded defect: genuine problems in the draft, false alarms, or duplicates.</p>
      ${toolbar("findings")}
      <div id="list-findings">${j.findings.map((v) => (byUnit[v.unit_id] ? findingCard(byUnit[v.unit_id], v) : "")).join("") || `<div class="empty">None.</div>`}</div>
      <details class="card" style="margin-top:14px"><summary>Findings matched to defects (${records.filter((r) => r.origin === "model" && !j.findings.some((x) => x.unit_id === r.unit_id)).length}) and open-gap findings (${records.filter((r) => r.origin === "open_gap").length})</summary>
        ${records.filter((r) => r.origin === "model" && !j.findings.some((x) => x.unit_id === r.unit_id)).map((r) => findingCard(r, null)).join("")}
        ${records.filter((r) => r.origin === "open_gap").map((r) => `<div class="item"><span class="pill">open gap</span> ${esc(r.message)} <span class="muted small">· ${esc(chapterTitle(f, r.target_chapter))}</span></div>`).join("")}
      </details>` : notRun(f, stage)}
      <h2 id="sec-seeded">The seeded draft the validator saw</h2>
      <p class="sub">The reference draft with every defect applied. <mark class="seeded">Highlighted</mark> text was injected.</p>
      ${(st.seeded_draft || []).map((c) => `<div class="card chapter" id="sd-${esc(c.chapter_ref)}">
        <div class="spread"><div><div class="eyebrow">${esc(c.chapter_ref)}</div><h3 style="font-size:17px">${esc(chapterTitle(f, c.chapter_ref))}</h3></div>${statuses[c.chapter_ref] ? badge(statuses[c.chapter_ref]) : ""}</div>
        <div class="doc" style="margin-top:8px">${highlightMd(c.body_markdown, [...seededSpans(c.chapter_ref), ...markerSpans(c.body_markdown)])}</div></div>`).join("")}`;
  }

  // ----- stage 4: editing -----
  function editingTab(f) {
    const stage = "editing";
    const st = f.stages[stage];
    const j = judgmentOf(f, stage);
    const fid = f.golden.fixture_id;
    const cases = f.golden.editing.cases;
    if (!st) return notRun(f, stage);
    const m = metricsOf(f, stage);
    const records = Object.fromEntries((st.cases || []).map((r) => [r.case_id, r]));
    const checks = Object.fromEntries((st.report?.details?.cases || []).map((c) => [c.case_id, c]));
    const judged = Object.fromEntries((j?.cases || []).map((c) => [c.case_id, c]));
    const head = j ? stageHeader(f, stage, [
      meter(m.case_pass_rate ?? null, 1, "Cases passing every check"),
      plainTile(pct(m.expected_change_rate), "Expected changes applied"),
      plainTile(pct(m.preservation_rate), "Protected statements preserved"),
      plainTile(`${m.unsupported_changes ?? 0} · ${m.collateral_edits ?? 0}`, "Unauthorized changes · collateral edits"),
    ]) : "";
    return `${head}
      ${jump(fid, stage, cases.map((c) => [`case-${c.id}`, c.id]))}
      ${cases.map((c) => {
        const r = records[c.id] || {};
        const ch = checks[c.id] || {};
        const v = judged[c.id];
        const chJ = Object.fromEntries((v?.changes || []).map((x) => [x.unit_id, x]));
        return `<div class="card" style="margin-top:22px" id="case-${esc(c.id)}">
          <div class="spread"><div><div class="eyebrow">edit case · ${esc(c.id)}</div><div class="instruction">“${esc(c.instruction)}”</div></div>
            <div style="text-align:right">${badge(ch.outcome_ok ? "pass" : "fail", `expected ${c.expected_outcome}, got ${r.outcome || "–"}`)}</div></div>
          ${r.clarification ? `<div class="callout" style="margin-top:10px"><b>Pipeline asked:</b> ${esc(r.clarification)}</div>` : ""}
          <div class="row small" style="margin-top:10px">
            ${(ch.changed_chapters || []).map((x) => `<span class="pill">changed: ${esc(chapterTitle(f, x))}</span>`).join("") || `<span class="pill">no chapter changed</span>`}
            ${(ch.collateral_chapters || []).map((x) => badge("fail", `outside the request: ${chapterTitle(f, x)}`)).join("")}
            ${Object.entries(ch.removed_markers || {}).map(([ref, ms]) => `<span class="pill">${ms.length} marker(s) filled in ${esc(chapterTitle(f, ref))}</span>`).join("")}
          </div>
          ${v ? `
          <div class="cols">
            <div><div class="colhead">Expected changes</div>${v.expected_changes.map((x) => `<div class="item" style="margin-top:6px">${badge(x.verdict)} <span class="stmt">${esc(c.expected_changes.find((e) => e.id === x.id)?.statement || x.id)}</span>${x.output_refs.length ? `<div style="margin-top:6px">${quotes(f, stage, x.output_refs, "out")}</div>` : ""}<div class="reason">${esc(x.reason)}</div></div>`).join("") || `<div class="empty">None expected.</div>`}</div>
            <div><div class="colhead">Must survive</div>${v.preserved.map((x) => `<div class="item" style="margin-top:6px">${badge(x.verdict)} <span class="stmt">${esc(c.must_preserve.find((e) => e.id === x.id)?.statement || x.id)}</span>${x.output_refs.length ? `<div style="margin-top:6px">${quotes(f, stage, x.output_refs, "gold")}</div>` : ""}<div class="reason">${esc(x.reason)}</div></div>`).join("") || `<div class="empty">–</div>`}</div>
          </div>` : ""}
          ${(r.changes || []).length ? `<div class="colhead" style="margin-top:14px">Applied changes (${r.changes.length})</div>
          ${r.changes.map((x) => {
            const [, , n] = x.unit_id.split("/");
            const verdict = chJ[x.unit_id];
            return `<div class="diff" id="cg-${esc(c.id)}-${n}"><div class="spread"><div class="colhead">${esc(chapterTitle(f, x.chapter_ref))} · ${esc(x.kind)}${x.user_input_quote ? " · user input" : ""}${x.source_refs.length ? ` · source ${esc(x.source_refs.join(","))}` : ""}</div>${verdict ? badge(verdict.verdict) : ""}</div>
              <del>${esc(x.before)}</del><ins>${esc(x.after) || "<i>(deleted)</i>"}</ins>
              ${verdict ? `<div class="reason">${esc(verdict.reason)}</div>` : ""}</div>`;
          }).join("")}` : ""}
          ${v?.contradictions?.length ? `<div class="colhead" style="margin-top:14px">Inconsistent after the edit</div>${v.contradictions.map(contradiction(f, stage)).join("")}` : ""}
          ${Object.entries(r.edited_chapters || {}).map(([ref, body]) => `<details style="margin-top:12px" id="ed-${esc(c.id)}-${esc(ref)}"><summary>Edited chapter · ${esc(chapterTitle(f, ref))}</summary>
            <div class="doc">${highlightMd(body, (r.changes || []).filter((x) => x.chapter_ref === ref && x.after).map((x) => ({ quote: x.after, cls: "seeded", tip: "<b>Changed by this edit</b>" })))}</div></details>`).join("")}
        </div>`;
      }).join("")}`;
  }

  // ----- reference draft -----
  function referenceTab(f) {
    const r = f.reference_draft;
    return `<p class="sub">${esc(r.provenance)}</p>
      <p class="sub">The frozen starting point for <a href="#/f/${f.golden.fixture_id}/verification">3 · Verification</a> (defects are seeded into it) and <a href="#/f/${f.golden.fixture_id}/editing">4 · Editing</a> (every case starts from it).</p>
      ${r.chapters.map((c) => `<div class="card chapter" id="rd-${esc(c.chapter_ref)}">
        <div class="eyebrow">${esc(c.chapter_ref)}</div><h3 style="font-size:17px">${esc(chapterTitle(f, c.chapter_ref))}</h3>
        <div class="doc" style="margin-top:8px">${highlightMd(c.body_markdown, markerSpans(c.body_markdown))}</div>
        ${c.gaps.length ? `<details style="margin-top:8px"><summary>${c.gaps.length} open gap(s)</summary>${c.gaps.map((gap) => `<div class="item" style="margin-top:6px"><span class="fid">${esc(gap.field_key)}</span> · <span class="pill">${esc(gap.severity)}</span><div class="stmt" style="margin-top:4px">${esc(gap.question)}</div><div class="muted small">${esc(gap.why_asking)}</div></div>`).join("")}</details>` : ""}
      </div>`).join("")}`;
  }

  // ----- source document -----
  function sourceTab(f) {
    const fid = f.golden.fixture_id;
    const isPdf = f.golden.source.source_format === "pdf";
    const spans = {};
    const add = (anchor, s) => (spans[anchor] ||= []).push(s);
    retained(f).forEach(({ key, label: name, e }) => {
      add(e.anchor || (e.page ? `page-${e.page}` : ""), { quote: e.text, cls: "kept", go: `ex-${key}`, tip: `<b>Kept by extraction · ${esc(name)}</b>` });
    });
    const tally = { full: 0, part: 0, none: 0 };
    for (const x of f.golden.extraction.facts)
      for (const e of x.evidence) {
        const u = unitForText(f, e.text);
        if (!u) continue;
        const kept = (spans[u.anchor] || []).filter((s) => s.cls === "kept");
        let covered = 0;
        for (const seg of segments(u.text, [...kept, { quote: e.text, cls: "gold" }]))
          if (seg.act.some((s) => s.cls === "kept") && seg.act.some((s) => s.cls === "gold")) covered += seg.text.length;
        tally[covered >= e.text.length ? "full" : covered > 0 ? "part" : "none"]++;
        add(u.anchor, { quote: e.text, cls: "gold", tip: `<b>Golden fact · ${esc(x.id)}</b>${esc(x.statement)}` });
      }
    for (const [stage, list] of Object.entries(D.examples))
      for (const ex of list)
        if (ex.fixture === fid && ex.source_passage) {
          const u = f.units.find((x) => `source/${x.anchor}` === ex.unit);
          if (u) add(u.anchor, { quote: ex.source_passage, cls: "example", tip: `<b>Few-shot example · ${esc(stage)} judge</b>${esc(ex.reason)}` });
        }
    const flags = (u) => {
      const out = new Set();
      for (const seg of segments(u.text, spans[u.anchor] || [])) {
        const g = seg.act.some((s) => s.cls === "gold"), k = seg.act.some((s) => s.cls === "kept"), x = seg.act.some((s) => s.cls === "example");
        if (g && k) out.add("both"); else if (g) out.add("gold"); else if (k) out.add("kept");
        if (x) out.add("example");
      }
      return out;
    };
    const unitFlags = Object.fromEntries(f.units.map((u) => [u.anchor, flags(u)]));
    const pips = (set) => ["both", "gold", "kept", "example"].filter((k) => set.has(k)).map((k) => `<i class="pip pip-${k}"></i>`).join("");
    const link = (u) => `#/f/${fid}/source/${enc("u-" + u.anchor)}`;
    let index;
    if (isPdf) {
      index = `<div class="pagegrid">${f.units.map((u) => {
        const n = /^page-(\d+)$/.exec(u.anchor)?.[1] || "?";
        return `<a href="${link(u)}" title="Page ${n}">${n}<span>${pips(unitFlags[u.anchor])}</span></a>`;
      }).join("")}</div>`;
    } else {
      const sections = [];
      for (const u of f.units) {
        const h = /^(#{1,6})\s+(.+)/.exec(u.text.trim());
        if (h || !sections.length) sections.push({ u, level: h ? h[1].length : 1, title: h ? h[2] : "Start", flags: new Set() });
        unitFlags[u.anchor].forEach((x) => sections.at(-1).flags.add(x));
      }
      index = sections.map((s) => `<a href="${link(s.u)}" class="lvl${s.level}">${inline(s.title)}<span>${pips(s.flags)}</span></a>`).join("");
    }
    const total = tally.full + tally.part + tally.none;
    return `<div class="layout-side">
      <aside class="toc"><div class="eyebrow">${isPdf ? `${f.units.length} pages` : "Sections"}</div>${index}</aside>
      <div>
        <div class="srcbar">
          <div class="legend" style="margin:0">
            <span><i class="sw sw-both"></i>Golden evidence extraction kept</span>
            <span><i class="sw sw-gold"></i>Golden evidence extraction missed</span>
            <span><i class="sw sw-kept"></i>Other text extraction kept</span>
            <span><i class="sw sw-example"></i>Few-shot example passage</span>
          </div>
          <div class="small" style="color:var(--ink-2)"><b>${total}</b> golden passages · <b>${tally.full}</b> fully kept · <b>${tally.part}</b> partly · <b>${tally.none}</b> missed
            <span class="muted">(text overlap only; the judge's verdicts are on <a href="#/f/${fid}/extraction">1 · Extraction</a>)</span></div>
        </div>
        <article class="paper doc">
          ${f.units.map((u) => {
            const n = /^page-(\d+)$/.exec(u.anchor)?.[1];
            return `<section class="srcunit" id="u-${esc(u.anchor)}">
              ${isPdf ? `<div class="page-rule">Page ${n}</div>` : `<a class="anchor-tag" href="${link(u)}" data-tip="${esc(`<b>Source unit</b>${esc(u.anchor)}`)}">¶</a>`}
              ${highlightMd(u.text, spans[u.anchor] || [])}
            </section>`;
          }).join("")}
        </article>
      </div>
    </div>`;
  }

  function inputTab(f) {
    const d = f.drafting_input;
    return `
      <p class="sub">What the drafter receives besides the source: funder, programme, application template, and authoritative city context.</p>
      <div class="grid g2">
        <div class="card"><dl class="kv">
          <dt>Run</dt><dd>${esc(d.run_name)}</dd><dt>Funder</dt><dd>${esc(d.funder)}</dd>
          <dt>Opportunity</dt><dd>${esc(d.opportunity)}</dd><dt>Template</dt><dd>${esc(d.template_name)}</dd>
        </dl></div>
        <div class="card"><div class="eyebrow">Template field inventory</div><div class="chips">${d.required_fields.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>
      </div>
      <h2>Application chapters <span class="muted small">(${d.chapter_schema.length})</span></h2>
      <div class="card" style="padding:0"><table>
        <thead><tr><th>#</th><th>Chapter</th><th>Asks for</th><th>Owns fields</th></tr></thead>
        <tbody>${d.chapter_schema.map((c, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(c.title)}</b><div class="fid">${esc(c.chapter_ref)}</div></td><td class="small" style="color:var(--ink-2)">${esc(c.description || "")}</td><td><div class="chips">${(c.required_fields || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div></td></tr>`).join("")}</tbody>
      </table></div>
      <h2>Authoritative city context</h2>
      <div class="card prompt"><pre>${esc(JSON.stringify(d.cc_context, null, 2))}</pre></div>`;
  }

  // ---------- runs: loading, picking, comparing ----------
  const RUN_METRICS = {
    extraction: [["required_fact_coverage", "facts kept"], ["topic_coverage", "topics"]],
    chapter_writing: [["required_fact_coverage", "facts"], ["gap_recall", "gaps flagged"], ["flagged_gap_validity", "raised gaps genuine"]],
    verification: [["defect_recall", "defects found"], ["false_alarm_rate", "false alarms"]],
    editing: [["case_pass_rate", "cases pass"]],
  };
  const LOWER_IS_BETTER = new Set(["false_alarm_rate"]);
  const runLabel = (r) => `${r.label ? `${r.label} · ` : ""}${r.generated_at ? new Date(r.generated_at).toLocaleString() : r.id}`;
  const indexFixtureIds = () => [...new Set(INDEX.flatMap((r) => Object.keys(r.fixtures)))].sort();
  const shortFixture = (fid) => fid.split("-")[0].replace(/^./, (c) => c.toUpperCase());
  const fmtTime = (s) => (s == null ? "–" : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);
  const fmtCost = (c) => (c == null ? "–" : `$${c.toFixed(2)}`);
  // Totals over a run's recorded stages; null for runs saved before usage recording.
  function usageTotals(usageByFixture) {
    const stages = Object.values(usageByFixture).flatMap((u) => Object.values(u || {}));
    if (!stages.length) return null;
    const sum = (key) => stages.reduce((n, s) => n + (s[key] || 0), 0);
    return { seconds: sum("seconds"), requests: sum("requests"), cost: sum("cost_usd") };
  }
  const indexTotals = (r) => usageTotals(Object.fromEntries(Object.entries(r.fixtures).map(([fid, fx]) => [fid, fx.usage])));
  const runTotals = (run) => usageTotals(Object.fromEntries(run.fixtures.map((f) => [f.golden.fixture_id, f.usage])));

  function loadRun(id) {
    return new Promise((resolve, reject) => {
      if (window.GOLDEN_RUNS?.[id]) return resolve(window.GOLDEN_RUNS[id]);
      const script = document.createElement("script");
      script.src = `runs/${encodeURIComponent(id)}/viewer.js`;
      script.onload = () => (window.GOLDEN_RUNS?.[id] ? resolve(window.GOLDEN_RUNS[id]) : reject(new Error(id)));
      script.onerror = () => reject(new Error(id));
      document.head.appendChild(script);
    });
  }

  function runPicker() {
    const select = document.getElementById("runpick");
    select.innerHTML = INDEX.map((r) => `<option value="${esc(r.id)}" ${r.id === CURRENT ? "selected" : ""}>${esc(runLabel(r))}</option>`).join("");
    select.onchange = () => {
      const params = new URLSearchParams(location.search);
      params.set("run", select.value);
      location.search = params.toString();
    };
  }

  function statusDot(status, tip) {
    return `<span class="rdot s-${cls(status)}" data-tip="${esc(tip)}"></span>`;
  }

  function delta(key, a, b) {
    if (a == null || b == null) return "";
    const d = b - a;
    if (Math.abs(d) < 1e-9) return `<span class="muted">=</span>`;
    const better = LOWER_IS_BETTER.has(key) ? d < 0 : d > 0;
    return `<span class="${better ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)} pts</span>`;
  }

  async function comparePage(aId, bId) {
    const fids = indexFixtureIds();
    const ordered = [...INDEX].reverse(); // oldest → newest for trends
    const history = `
      <h2>Run history</h2>
      <p class="sub">Every run saved in the results folder, newest first. Each dot is one stage of one document; hover for its metrics. Pick any two runs to compare.</p>
      <div class="card" style="padding:0;overflow-x:auto"><table class="history">
        <thead><tr><th>Run</th><th>Time · cost</th>${fids.map((fid) => `<th>${esc(shortFixture(fid))}<div class="muted small" style="text-transform:none;letter-spacing:0">${STAGE_KEYS.map((s) => STAGES[s].n).join(" · ")}</div></th>`).join("")}<th>Compare</th></tr></thead>
        <tbody>${INDEX.map((r) => `<tr class="${r.id === aId || r.id === bId ? "picked" : ""}">
          <td><a href="?run=${enc(r.id)}#/"><b>${esc(r.label || r.id)}</b></a><div class="muted small mono">${esc(r.id)}</div>
            <div class="muted small">${esc(r.generated_at ? new Date(r.generated_at).toLocaleString() : "")} · ${esc(r.code_version || "unknown commit")}</div></td>
          <td class="nowrap">${(() => {
            const u = indexTotals(r);
            return u ? `${fmtTime(r.wall_seconds ?? u.seconds)}<div class="muted small">${fmtCost(u.cost)} · ${u.requests} requests</div>` : `<span class="muted" data-tip="Saved before time and cost were recorded">–</span>`;
          })()}</td>
          ${fids.map((fid) => {
            const fx = r.fixtures[fid];
            if (!fx) return `<td class="muted">–</td>`;
            return `<td>${STAGE_KEYS.map((s) => {
              const st = fx.stages[s];
              const metrics = st ? Object.entries(st.metrics).map(([k, v]) => `${k.replace(/_/g, " ")}: ${pct(v)}`).join("<br>") : "";
              return statusDot(st?.status || "notrun", `<b>${esc(shortFixture(fid))} · ${STAGES[s].label}: ${esc(label(st?.status || "notrun"))}</b>${metrics}`);
            }).join("")}</td>`;
          }).join("")}
          <td class="nowrap"><a class="pill" href="#/compare/${enc(r.id)}/${enc(bId || r.id)}">A</a> <a class="pill" href="#/compare/${enc(aId || r.id)}/${enc(r.id)}">B</a></td>
        </tr>`).join("")}</tbody></table></div>

      <h2>Headline metrics over time</h2>
      <p class="sub">Oldest run on the left. Arrows compare each run with the previous run that evaluated the same stage; green is better.</p>
      <div class="card" style="padding:0;overflow-x:auto"><table class="trend">
        <thead><tr><th>Document · stage · metric</th>${ordered.map((r) => `<th class="nowrap"><a href="?run=${enc(r.id)}#/">${esc(r.label || r.id)}</a></th>`).join("")}</tr></thead>
        <tbody>${fids.flatMap((fid) => STAGE_KEYS.flatMap((s) => RUN_METRICS[s].map(([key, name]) => {
          let previous = null;
          const cells = ordered.map((r) => {
            const value = r.fixtures[fid]?.stages[s]?.metrics?.[key];
            const status = r.fixtures[fid]?.stages[s]?.status;
            const text = value == null ? (status === "error" ? `<span class="muted" data-tip="Judgment rejected; no official metrics">error</span>` : "–") : `${pct(value)} ${delta(key, previous, value)}`;
            if (value != null) previous = value;
            return `<td class="nowrap">${text}</td>`;
          });
          return `<tr><td>${esc(shortFixture(fid))} · ${STAGES[s].n} ${esc(STAGES[s].label)} · <span class="muted">${esc(name)}</span></td>${cells.join("")}</tr>`;
        }))).join("")}</tbody></table></div>`;

    if (!aId || !bId || aId === bId) {
      return `<div class="eyebrow">Runs</div><h1>Compare runs</h1>
        <p class="lede">${INDEX.length < 2 ? "Only one run is saved so far. Each new evaluator run is added here automatically." : "Pick run A and run B in the history below."}</p>${history}`;
    }
    let A, B;
    try {
      [A, B] = await Promise.all([loadRun(aId), loadRun(bId)]);
    } catch (error) {
      return `<h1>Compare runs</h1><div class="callout err">Could not load run ${esc(error.message)}. Republish the results folder.</div>${history}`;
    }
    return `<div class="eyebrow">Runs</div><h1>Compare runs</h1>
      <div class="grid g2" style="margin-top:14px">${[["A", A], ["B", B]].map(([tag, run]) => `<div class="card"><div class="eyebrow">Run ${tag}</div>
        <h3 style="font-size:17px">${esc(run.run.label || run.run.id)}</h3>
        <div class="muted small mono">${esc(run.run.id)} · ${esc(run.run.code_version || "unknown commit")}</div>
        <div class="muted small">${esc(run.run.generated_at ? new Date(run.run.generated_at).toLocaleString() : "")}${run.run.snapshot === "rebuilt_with_current_fixtures" ? " · snapshot rebuilt with later fixtures" : ""}</div>
        <div class="small" style="margin-top:6px">${(() => {
          const u = runTotals(run);
          return u ? `<b>${fmtTime(run.run.wall_seconds ?? u.seconds)}</b> · <b>${fmtCost(u.cost)}</b> · ${u.requests} model requests` : `<span class="muted">Time and cost not recorded for this run</span>`;
        })()}</div>
        <a class="small" href="?run=${enc(run.run.id)}#/">Open this run →</a></div>`).join("")}</div>
      ${provenanceDiff(A, B)}
      ${stageDiff(A, B)}
      ${usageDiff(A, B)}
      ${verdictDiff(A, B)}
      ${history}`;
  }

  function provenanceDiff(A, B) {
    const rows = [];
    const add = (name, a, b) => rows.push(`<tr class="${a === b ? "" : "changed"}"><td>${esc(name)}</td><td class="mono small">${esc(a ?? "–")}</td><td class="mono small">${esc(b ?? "–")}</td><td>${a === b ? `<span class="muted">same</span>` : badge("unclear", "changed")}</td></tr>`);
    add("Code version", A.run.code_version, B.run.code_version);
    add("Analysis contract", short(A.run.analysis_contract_version, 16), short(B.run.analysis_contract_version, 16));
    for (const role of new Set([...Object.keys(A.run.models || {}), ...Object.keys(B.run.models || {})])) {
      const m = (r) => (r.run.models?.[role] ? `${r.run.models[role].name} (${r.run.models[role].reasoning_effort || "–"})` : null);
      add(`Model · ${role.replace(/_/g, " ")}`, m(A), m(B));
    }
    for (const stage of STAGE_KEYS) add(`Judge prompt · ${stage}`, short(A.run.judge_prompt_versions?.[stage], 12), short(B.run.judge_prompt_versions?.[stage], 12));
    const fx = (run, fid) => run.fixtures.find((f) => f.golden.fixture_id === fid);
    for (const fid of new Set([...A.fixtures, ...B.fixtures].map((f) => f.golden.fixture_id))) {
      const a = fx(A, fid), b = fx(B, fid);
      add(`Source · ${shortFixture(fid)}`, a ? short(a.golden.source.sha256, 12) : null, b ? short(b.golden.source.sha256, 12) : null);
      const digest = (f) => (f ? String(JSON.stringify([f.golden.extraction, f.golden.chapter_writing, f.golden.verification, f.golden.editing]).length) + " chars" : null);
      add(`Golden expectations · ${shortFixture(fid)}`, digest(a), digest(b));
    }
    return `<h2>What changed between the runs</h2>
      <p class="sub">A changed model, prompt, source or expectation explains a changed result; if nothing here changed, the difference is run-to-run variance.</p>
      <div class="card" style="padding:0"><table><thead><tr><th>Input</th><th>Run A</th><th>Run B</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function stageDiff(A, B) {
    const fids = [...new Set([...A.fixtures, ...B.fixtures].map((f) => f.golden.fixture_id))];
    const fx = (run, fid) => run.fixtures.find((f) => f.golden.fixture_id === fid);
    return `<h2>Stage results, A → B</h2>
      <div class="card" style="padding:0;overflow-x:auto"><table>
        <thead><tr><th>Document</th>${STAGE_KEYS.map((s) => `<th>${STAGES[s].n} · ${STAGES[s].label}</th>`).join("")}</tr></thead>
        <tbody>${fids.map((fid) => `<tr><td><b>${esc(shortFixture(fid))}</b></td>${STAGE_KEYS.map((s) => {
          const a = fx(A, fid)?.stages[s], b = fx(B, fid)?.stages[s];
          const sa = stageStatus(a), sb = stageStatus(b);
          const metrics = RUN_METRICS[s].map(([key, name]) => {
            const va = a?.report?.metrics?.[key], vb = b?.report?.metrics?.[key];
            if (va == null && vb == null) return "";
            return `<div class="cellnote">${esc(name)}: ${pct(va)} → ${pct(vb)} ${delta(key, va, vb)}</div>`;
          }).join("");
          return `<td>${badge(sa)} → ${badge(sb)}${metrics}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function usageDiff(A, B) {
    if (!runTotals(A) && !runTotals(B)) return "";
    const fids = [...new Set([...A.fixtures, ...B.fixtures].map((f) => f.golden.fixture_id))];
    const usage = (run, fid, s) => run.fixtures.find((f) => f.golden.fixture_id === fid)?.usage?.[s];
    const change = (a, b, fmt, lowerIsBetter = true) => {
      if (a == null || b == null || !a) return `${fmt(a)} → ${fmt(b)}`;
      const ratio = b / a - 1;
      const cls = Math.abs(ratio) < 0.05 ? "muted" : (ratio < 0) === lowerIsBetter ? "up" : "down";
      return `${fmt(a)} → ${fmt(b)} <span class="${cls}">${ratio > 0 ? "+" : ""}${Math.round(ratio * 100)}%</span>`;
    };
    const rows = fids.flatMap((fid) => STAGE_KEYS.map((s) => {
      const a = usage(A, fid, s), b = usage(B, fid, s);
      if (!a && !b) return "";
      return `<tr><td>${esc(shortFixture(fid))} · ${STAGES[s].n} ${esc(STAGES[s].label)}</td>
        <td class="nowrap">${change(a?.seconds, b?.seconds, fmtTime)}</td>
        <td class="nowrap">${change(a?.cost_usd, b?.cost_usd, fmtCost)}</td>
        <td class="nowrap">${a?.requests ?? "–"} → ${b?.requests ?? "–"}</td></tr>`;
    }));
    const ta = runTotals(A), tb = runTotals(B);
    const agents = {};
    for (const [tag, run] of [["a", A], ["b", B]])
      for (const f of run.fixtures)
        for (const st of Object.values(f.usage || {}))
          for (const [name, u] of Object.entries(st.agents || {})) {
            const row = (agents[name] ||= { a: 0, b: 0, ra: 0, rb: 0 });
            row[tag] += u.cost_usd || 0;
            row["r" + tag] += u.requests || 0;
          }
    const agentRows = Object.entries(agents).sort((x, y) => y[1].b - x[1].b).map(([name, u]) =>
      `<tr><td class="mono small">${esc(name)}</td><td class="nowrap">${ta ? `${fmtCost(u.a)} · ${u.ra}` : "–"}</td><td class="nowrap">${fmtCost(u.b)} · ${u.rb}</td>
        <td>${tb?.cost ? `${Math.round((u.b / tb.cost) * 100)}%` : "–"}</td></tr>`).join("");
    return `<h2>Time and cost, A → B</h2>
      <p class="sub">Wall time of each stage and the cost OpenRouter reported for its model requests (the provider's charge for bring-your-own-key requests). Stage times overlap when documents run in parallel.</p>
      <div class="card" style="padding:0;overflow-x:auto"><table>
        <thead><tr><th>Document · stage</th><th>Time</th><th>Cost</th><th>Requests</th></tr></thead>
        <tbody>${rows.join("")}
          <tr><td><b>Run total</b></td><td class="nowrap"><b>${change(A.run.wall_seconds ?? ta?.seconds, B.run.wall_seconds ?? tb?.seconds, fmtTime)}</b> <span class="muted small">wall</span></td>
          <td class="nowrap"><b>${change(ta?.cost, tb?.cost, fmtCost)}</b></td><td>${ta?.requests ?? "–"} → ${tb?.requests ?? "–"}</td></tr></tbody></table></div>
      ${agentRows ? `<h3 style="margin-top:18px">Where the money goes</h3>
      <div class="card" style="padding:0;overflow-x:auto"><table>
        <thead><tr><th>Agent (configured prompt)</th><th>Run A · requests</th><th>Run B · requests</th><th>Share of B</th></tr></thead>
        <tbody>${agentRows}</tbody></table></div>` : ""}`;
  }

  function verdictDiff(A, B) {
    const fx = (run, fid) => run.fixtures.find((f) => f.golden.fixture_id === fid);
    const sections = [];
    for (const fid of new Set([...A.fixtures, ...B.fixtures].map((f) => f.golden.fixture_id))) {
      const a = fx(A, fid), b = fx(B, fid);
      if (!a || !b) continue;
      const changes = [];
      const compare = (stage, kind, listOf, nameOf) => {
        const ja = judgmentOf(a, stage), jb = judgmentOf(b, stage);
        if (!ja || !jb) return;
        const va = Object.fromEntries(listOf(ja).map((x) => [x.id, x.verdict]));
        const vb = Object.fromEntries(listOf(jb).map((x) => [x.id, x.verdict]));
        for (const id of new Set([...Object.keys(va), ...Object.keys(vb)])) {
          if (va[id] !== vb[id]) changes.push(`<tr><td>${STAGES[stage].n} · ${esc(kind)}</td><td>${esc(nameOf(id))}<div class="fid">${esc(id)}</div></td><td>${va[id] ? badge(va[id]) : "–"}</td><td>${vb[id] ? badge(vb[id]) : "–"}</td></tr>`);
        }
      };
      const statement = (list, id) => list?.find((x) => x.id === id)?.statement || id;
      compare("extraction", "fact", (j) => j.facts, (id) => statement(b.golden.extraction.facts, id));
      compare("chapter_writing", "fact", (j) => j.facts, (id) => statement(b.golden.chapter_writing?.facts, id));
      compare("chapter_writing", "expected gap", (j) => j.gaps || [], (id) => statement(b.golden.chapter_writing?.gaps, id));
      compare("verification", "seeded defect", (j) => j.defects, (id) => b.golden.verification?.defects.find((d) => d.id === id)?.description || id);
      const caseVerdicts = (f) => {
        const report = f.stages.editing?.report;
        if (!report?.judgment) return null;
        const failing = [...(report.semantic_failures || []), ...(report.integrity_failures || [])];
        return Object.fromEntries((report.details?.cases || []).map((c) => [c.case_id, c.outcome_ok && !failing.some((x) => x.startsWith(c.case_id)) ? "pass" : "fail"]));
      };
      const ca = caseVerdicts(a), cb = caseVerdicts(b);
      if (ca && cb)
        for (const id of new Set([...Object.keys(ca), ...Object.keys(cb)]))
          if (ca[id] !== cb[id]) changes.push(`<tr><td>4 · edit case</td><td>${esc(b.golden.editing?.cases.find((c) => c.id === id)?.instruction || id)}<div class="fid">${esc(id)}</div></td><td>${ca[id] ? badge(ca[id]) : "–"}</td><td>${cb[id] ? badge(cb[id]) : "–"}</td></tr>`);
      sections.push(`<h3 style="margin:22px 0 10px">${esc(cityOf(b))} <span class="muted small">(${changes.length} changed verdict${changes.length === 1 ? "" : "s"})</span></h3>
        ${changes.length ? `<div class="card" style="padding:0"><table><thead><tr><th>Stage · item</th><th>Expectation</th><th>Run A</th><th>Run B</th></tr></thead><tbody>${changes.join("")}</tbody></table></div>` : `<div class="empty">Every comparable verdict is the same in both runs.</div>`}`);
    }
    return `<h2>Verdicts that changed</h2>
      <p class="sub">Item-by-item differences for expectations judged in both runs. Stages without a valid judgment in either run are skipped.</p>${sections.join("")}`;
  }

  // ---------- routing ----------
  async function render() {
    if (!D) return; // the first run is still loading
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    let html, active = "overview";
    if (parts[0] === "f" && fixtureById(parts[1])) {
      const f = fixtureById(parts[1]);
      const tabs = ["golden", "source", "reference", "input", ...fixtureStages(f)];
      const tab = tabs.includes(parts[2]) ? parts[2] : "golden";
      active = f.golden.fixture_id;
      html = fixturePage(f, tab);
    } else if (parts[0] === "compare") {
      active = "compare";
      const previous = INDEX[INDEX.findIndex((r) => r.id === CURRENT) + 1]?.id;
      html = await comparePage(parts[1] || previous || null, parts[2] || CURRENT);
    } else if (parts[0] === "stage" && STAGES[parts[1]]) {
      active = `stage-${parts[1]}`;
      html = stagePage(parts[1]);
    } else {
      html = overview();
    }
    nav.innerHTML = [
      `<a href="#/" class="${active === "overview" ? "active" : ""}">Overview</a>`,
      ...STAGE_KEYS.map((s) => `<a href="#/stage/${s}" class="${active === `stage-${s}` ? "active" : ""}">${STAGES[s].n} · ${STAGES[s].label}</a>`),
      `<a href="#/compare" class="${active === "compare" ? "active" : ""}">Compare runs</a>`,
      `<span class="navsep" aria-hidden="true"></span>`,
      ...D.fixtures.map((f) => `<a href="#/f/${f.golden.fixture_id}/golden" class="doclink ${active === f.golden.fixture_id ? "active" : ""}">${esc(cityOf(f))}</a>`),
    ].join("");
    app.innerHTML = html;
    const target = parts[0] === "f" ? parts.slice(3).join("/") : "";
    if (target) {
      const el = document.getElementById(target);
      if (el) {
        el.closest("details")?.setAttribute("open", "");
        requestAnimationFrame(() => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 72 - (document.querySelector(".srcbar")?.offsetHeight || 0), behavior: "instant" }));
        el.classList.add("flash-target");
      }
    } else window.scrollTo(0, 0);
  }

  // ---------- interactions ----------
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset.filter) return;
    const list = document.getElementById(`list-${t.dataset.filter}`);
    list?.querySelectorAll(".item.ok").forEach((el) => (el.style.display = t.checked ? "none" : ""));
    list?.querySelectorAll("h3").forEach((h) => {
      let n = h.nextElementSibling, any = false;
      while (n && n.tagName !== "H3") { if (n.style.display !== "none") any = true; n = n.nextElementSibling; }
      h.style.display = any ? "" : "none";
    });
  });
  document.addEventListener("click", (e) => {
    const m = e.target.closest("mark[data-go]");
    if (!m) return;
    const el = document.getElementById(m.dataset.go);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("flash-target"); void el.offsetWidth; el.classList.add("flash-target");
    } else if (m.dataset.go.startsWith("ex-")) {
      location.hash = `#/f/${location.hash.split("/")[2]}/extraction/${m.dataset.go}`;
    }
  });
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) { tip.classList.remove("on"); return; }
    tip.innerHTML = el.dataset.tip;
    tip.classList.add("on");
  });
  document.addEventListener("mousemove", (e) => {
    if (!tip.classList.contains("on")) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${Math.max(8, y)}px`;
  });
  const setTheme = (t) => { document.documentElement.dataset.theme = t; localStorage.setItem("golden-theme", t); };
  setTheme(localStorage.getItem("golden-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  document.getElementById("theme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  window.addEventListener("hashchange", render);
  if (!CURRENT) {
    app.innerHTML = `<h1>No runs yet</h1><p class="lede">Run the evaluator; each run is saved in <code>runs/</code> next to this page and appears here automatically.</p>
      <pre class="card">cd climate-advisor\nuv run --directory service python -m scripts.evaluate_cnb_golden_set --label my-first-run</pre>`;
  } else {
    runPicker();
    loadRun(CURRENT)
      .then((payload) => { D = payload; render(); })
      .catch(() => { app.innerHTML = `<h1>Run not found</h1><p class="lede">Could not load <code>runs/${esc(CURRENT)}/viewer.js</code>. Republish with <code>python -m scripts.cnb_golden_set_viewer.publish</code>.</p>`; });
  }
})();
