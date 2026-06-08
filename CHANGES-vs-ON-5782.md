# Stationary Energy agentic flow — what we changed and why

**Baseline:** `ON-5782-CC-AF-adjustments` (the branch we cloned this morning)
**Branch:** `carlos/stationary-energy-demo`
**Footprint:** 19 files, +2,078 / −421 lines — all inside the Stationary Energy agentic flow plus a demo seeder. Nothing in `develop`, no shared/production code, no real data touched.

This is written to be read top-to-bottom: each section explains the problem we hit, what we changed, and where it lives.

---

## The big picture

A user opens the Stationary Energy sector and Clima (the AI advisor) offers to fill it in from third-party data already integrated into CityCatalyst. The screen is split: **Clima chat on the left, a live "working draft" of the inventory on the right.** The agent drafts each empty row, the user reviews the values and the data sources behind them, and saves.

Two layers of work went into this branch: the **backend that generates the draft** (Climate Advisor, Python), and the **front-end the user actually clicks** (React/TypeScript). The backend is committed; the front-end is partly committed (the first working version) and partly still in the working tree (today's UX pass).

---

## 1. The backend: making drafting fast, cheap, and only AI-when-needed

**The problem.** The original flow made one big call to the language model to draft the whole sector. That's slow, expensive, and overkill — most rows are trivial (there's exactly one data source, or none at all).

**What we did.** We rebuilt the generator so it does the obvious work itself and only calls the AI when sources genuinely disagree.

- It now drafts **in small batches in the background**: `/start` returns instantly with a "generating" status, and rows stream in a few at a time so the user can watch the draft fill up (`stationary_energy_draft_service.py`).
- A new **deterministic fast-path** handles the easy cases with plain code, no AI (`stationary_energy_llm_output.py`): no source → a gap; one source → copy its value straight in; a "notation key" from the source (`NO` = not occurring, `NE` = not estimated, etc.) → a proper notation instead of a blank.
- Only rows where **two or more sources with real emissions compete** get routed to the agent, which reasons about the trade-off and writes an explanation. If the model is unavailable, a per-batch deterministic fallback still produces a sensible answer.

**Why it matters for the demo.** Drafting went from ~70–90 seconds (one model call for everything) to a couple of seconds, and the AI is now visibly reserved for the interesting decisions.

**One demo-only addition:** because the seeded Brazilian cities don't actually have any conflicting sources, a flag (`SE_DEMO_SYNTHETIC_CONFLICT`) clones one source into a fake competitor so the agent's conflict-resolution path can be shown live. It's off by default.

---

## 2. The front-end: from "it works" to "it's usable"

The committed first version made the flow functional — it polls for progress while the draft generates, shows the emissions numbers (which were buried in the data and never displayed), and moved the decision cards out of the chat (where they piled up) into a side panel.

Today's pass — still in the working tree — is where most of the UX work happened. The story of it:

**The layout kept collapsing on laptops.** The three panels (chat · working draft · source review) only sat side-by-side on very wide monitors; on a normal laptop the middle panel silently collapsed to nothing. We fixed the layout so the three columns hold from `xl` width up, each scrolling on its own, and stack cleanly on smaller screens. We also merged what used to be four separate boxes (header, progress, rows, footer) into **one tidy card**, so everything lines up to the same edge.

**The rows were a wall of similar-looking, cropped text.** We did several things: sorted them in proper GPC order (I.1.1 → I.1.2 → … so scopes nest correctly), **grouped them under sub-sector headings** (I.1 · Residential Buildings) — which also let us drop the repeated prefix from every row — and gave each row a small **highlighted "chip" showing its data source** so you can see at a glance where a number came from. Rows with no source say so plainly.

**The source-review cards didn't let you actually judge a source.** We rebuilt them so the **source name gets the full width** (no more truncation), the **emissions value sits below it**, and there's a **"Why this source" line** that surfaces the agent's own reasoning. We swapped the easy-to-miss checkmark for proper **radio buttons** so it's obvious you're picking one of several. And we added a **"See source details"** link that opens CityCatalyst's *existing* source drawer (reused, not rebuilt) showing the dataset's scope, quality, year range, methodology and link — so the demo proves these are real, inspectable sources.

**The chat felt one-directional.** We added **suggested questions** above the message box that change with context, made "Ask about this row" send immediately, and replaced the placeholder asterisk avatar with the real Clima sparkle icon.

**General polish.** We aligned all spacing to the design system's scale (the 8/16/24/32 rhythm you have in Terra), fixed pill/progress-bar shapes that were rendering as stretched ellipses, fixed a dropdown whose arrow was clipping and whose text was hard-cropping, and added a **"Back to inventory" button** so the user is never stranded in the flow.

**Source naming, informed by the Figma "new flow" design.** The design uses short brand names for sources (SEEG, EPE, ClimateTRACE), which is what let its cards stay compact. Our live data carries the *full* names ("Sistema de Estimativa de Emissão de Gases do Efeito Estufa"), which is what forced our cards to wrap. We added a small rule that prefers a source's publisher acronym when it's a clean brand (EPE, SEEG) and falls back to the full name otherwise. With that, the **row source markers became compact pills** (a dot + the short name, full name on hover), and in the **decision cards the source name and its emissions value now sit on one line**, with the full name as a quieter second line — so you can scan a column of clean brand names while still seeing the full source. We also softened the status wording to match the design ("Needs a decision", "Ready"). The bigger moves the design implies — collapsing to a two-column layout and to 8 sub-sector rows — are left as a follow-up because they need a backend/aggregation decision, not just CSS.

**One subtle bug worth knowing:** the reused source drawer reads its labels from a different translation file (`data`), so at first it showed raw keys like `about-data-availability-description`. We gave it a translator bound to its own namespace and it reads correctly now.

Files, if a dev wants to dig in: everything under `app/src/components/StationaryEnergyDraft/` — the page shell (`StationaryEnergyChatArtifactPage`), the working-draft card (`stationary-energy-artifact-panel`), the source-review cards (`stationary-energy-review-cards`, `stationary-energy-source-detail-pane`), the chat (`stationary-energy-chat-*`), the row/data builders (`flow-artifact-rows`, `flow-review`, `flow-types`, `utils`), and the controller (`use-stationary-energy-chat-artifact-controller`).

---

## 3. The supporting bits

- **Translations** (`en/stationary-energy-agentic.json`): new labels for the back button, suggested questions, source details, and the "why this source" copy. We also fixed a quirk where slashes in source names rendered as `&#x2F;`.
- **Demo seeder** (`app/scripts/seed-brazil.ts`, committed): one idempotent, localhost-only script that creates the "Brazil Demo" project with São Paulo / Rio / Curitiba and 2023 inventories, so anyone can reproduce the demo.
- **Tests** (`stationary-energy-draft-flow.jest.ts`): updated to the new source data shape. (There's one failing test in this file — `formats raw draft emissions from kg` — but it was already failing on `ON-5782` before we touched anything, so it's not ours.)
- **Local config** (`.env`, `llm_config.yaml`): hold the API keys and the demo flag. These are local-only and must not ship.

---

## What's committed vs. what isn't (so nobody is surprised)

- **Committed:** the whole backend (Climate Advisor) and the first working version of the front-end flow, plus the seeder.
- **Working tree (not yet committed):** today's UI/UX pass — the layout fix, row grouping + source chips, the redesigned source-review cards + radios + drawer, the back button, dropdown, icon, and spacing work.

---

## Things to keep in mind for the demo

- Always **start a new draft** to see the latest behaviour — the browser resumes the last draft id from local storage, and old drafts are frozen snapshots.
- The seeded cities have **no genuine source conflicts**, so the agent's conflict path only fires with `SE_DEMO_SYNTHETIC_CONFLICT` on (or on data that really competes). Everything else resolves deterministically and instantly.
- After any backend change, **rebuild Climate Advisor** with `docker compose up -d --build --force-recreate climate-advisor`.
