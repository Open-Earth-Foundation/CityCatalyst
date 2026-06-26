# Stationary Energy — agentic chat UX overhaul

## What this is

This branch reworks the Stationary Energy agentic draft experience so it behaves
like a modern agentic chat (Claude / Claude Code) rather than a wizard wrapped
around a few buttons. Five reported UX problems are fixed, the chat is given a
proper Clima welcome, and — most importantly — the chat agent gains the ability
to **start a draft from natural language**, closing the gap where drafting only
happened by clicking a button. The frontend work is intentionally minimal-diff
and reuses existing components and controller actions; the one genuinely new
capability (start-draft) required a small, well-scoped change to the Climate
Advisor agent.

This branch is based on `ON-5883-whole-inventory-tools` because the work builds
directly on that PR's Stationary Energy capability routes and inventory tools —
it does not apply cleanly on top of `develop` alone.

## At a glance

- **Composer keeps focus** after each send, so you can keep typing without
  clicking back in.
- **Fresh drafts open to a real empty state** — a Clima welcome instead of a
  "Coverage check" panel and auto-staged review cards; drafting only starts when
  you ask for it.
- **A left "Drafts" sidebar** lists drafts like chat sessions (status + time),
  with switch and "+ New draft".
- **The right panel is now a read-only inventory overview** that stops mirroring
  whatever row you hover.
- **"Recommended" is shown as a hint, not a selection** — no radio is pre-filled,
  so choosing a source is a clear, deliberate click.
- **You can draft by talking to Clima** — typing "draft the empty rows" now
  starts drafting; the compare / stage / save tools are reachable by chat too.
- **A redesigned Clima welcome** introduces the assistant and what it can do.

---

## Frontend (UI / UX)

### 1. Composer keeps focus after sending
**File:** `app/src/components/StationaryEnergyDraft/stationary-energy-chat-artifact-panels.tsx`

The chat input was `disabled` while a reply streamed, which blurred it and never
restored focus. The input now stays enabled during streaming (the existing
in-flight guard already prevents double-send), and a small effect returns the
cursor to the composer when streaming finishes.

### 2. Fresh / new draft opens to a clean empty state, generates on demand
**Files:** `stationary-energy-chat-stage-messages.tsx`, `stationary-energy-chat-primitives.tsx`,
`stationary-energy-drafts-panel.tsx`

The verbose "Coverage check" checklist that made an empty draft look like a
conversation-in-progress was removed in favour of a designed Clima welcome.
Creating a new draft now lands on that empty state (via the existing `startOver`
action) instead of auto-generating, so review cards no longer flood the chat
before you ask — generation runs only when you choose "Draft the empty rows" or
say so in chat.

### 3. Right panel is a static inventory overview (no hover mirroring)
**Files:** `stationary-energy-artifact-panel.tsx`, `stationary-energy-chat-artifact-panels.tsx`

The decision cards no longer set the focused row on hover, and the panel no
longer highlights / auto-scrolls to that row, so it stops feeling like a
duplicate of the chat. The panel keeps its existing aggregates (progress bar,
sub-sector groups, ready/gap/decision counts) and now reads as an overview;
focus is set only when you explicitly click "Ask about this row" so the chat
still sends the right context.

### 4. "Recommended" is a hint, not a pre-selection
**Files:** `stationary-energy-review-cards.tsx`, `stationary-energy-chat-artifact-panels.tsx`

A `pristine` flag was added to the review cards so an untouched proposal renders
with no radio filled — the recommended source is marked only by its badge and
"why" note. Selecting a source is therefore an explicit click that produces a
distinct staged/"Selected" state, removing the confusion between "the system
suggests this" and "you chose this".

### 5. Left "Drafts" sessions panel
**Files:** `stationary-energy-drafts-panel.tsx` (new), `stationary-energy-chat-artifact-page.tsx`,
`stationary-energy-artifact-panel.tsx`

The drafts `<select>` was moved out of the overview header into a new left,
collapsible panel that stacks drafts like Claude/Claude Code sessions (status
badge, timestamp, active highlight, "+ New draft"). The page layout became three
collapsible regions — drafts | chat | overview — reusing the existing
right-panel collapse pattern, with a stacked fallback on small screens.

### 6. Redesigned Clima welcome (empty state)
**Files:** `stationary-energy-chat-primitives.tsx`, `stationary-energy-chat-stage-messages.tsx`,
`app/src/i18n/locales/en/stationary-energy-agentic.json`

A `StationaryEnergyChatWelcome` component replaces the two plain intro bubbles:
a centred Clima mark, a heading and one-line intro, a "What I can do" card
(draft / compare / save), the primary actions, and a nudge to just say what you
need. It signals the now-fully-agentic chat and gives the empty state real
shape.

### 7. Frontend wiring for the agentic flow
**Files:** `stationary-energy-chat-controller-helpers.ts`, `use-stationary-energy-chat-artifact-controller.ts`

`buildStationaryEnergyChatRequest` now always sends `city_id`, `inventory_id`
and an interaction marker (even before a draft exists) so the agent can offer
the start-draft tool. The controller handles a new `stationary_energy_draft_started`
tool event by loading the freshly created draft, after which the existing status
poller fills in proposals.

---

## Climate Advisor agent (backend)

The chat agent could review, stage and save **within an existing draft**, but it
had no way to **start** one — drafting was button-only. This branch adds that
capability.

### New start-draft tool
**File:** `climate-advisor/service/app/tools/stationary_energy_start_draft_tools.py` (new)

A `stationary_energy_start_draft` agent tool that calls
`StationaryEnergyDraftService.start_draft(...)` for the active city + inventory,
mirroring the review tools' scoped/committed-session pattern. It returns a
`stationary_energy_draft_started` UI event carrying the new `draft_run_id`;
generation continues in the background exactly as the button path does.

### Registration, context and prompt
**Files:** `climate-advisor/service/app/services/agent_service.py`,
`climate-advisor/service/app/utils/streaming_handler.py`,
`climate-advisor/service/app/services/stationary_energy/stationary_energy_tool_events.py`,
`climate-advisor/prompts/stationary_energy_review.md`

`AgentService` now accepts `city_id` and a Stationary-Energy-surface flag and
registers the start-draft tool whenever that surface is active (independent of
whether a draft exists); `StreamingHandler` extracts those from the chat context.
The new UI event was added to the streamed-event whitelist, and the review prompt
gained a "Start or redraft" route plus the tool's documentation (with a focused
hint appended to the default prompt for the pre-draft case).

> The compare / stage / "accept all recommended" / save-to-inventory tools were
> already reachable from chat (with confirmation cards for writes) and are
> unchanged; the start-draft tool completes the set so every step is callable by
> natural language.

---

## Files changed

**Frontend**
- `app/src/components/StationaryEnergyDraft/stationary-energy-artifact-panel.tsx`
- `app/src/components/StationaryEnergyDraft/stationary-energy-chat-artifact-page.tsx`
- `app/src/components/StationaryEnergyDraft/stationary-energy-chat-artifact-panels.tsx`
- `app/src/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers.ts`
- `app/src/components/StationaryEnergyDraft/stationary-energy-chat-primitives.tsx`
- `app/src/components/StationaryEnergyDraft/stationary-energy-chat-stage-messages.tsx`
- `app/src/components/StationaryEnergyDraft/stationary-energy-review-cards.tsx`
- `app/src/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller.ts`
- `app/src/components/StationaryEnergyDraft/stationary-energy-drafts-panel.tsx` *(new)*
- `app/src/i18n/locales/en/stationary-energy-agentic.json`

**Climate Advisor**
- `climate-advisor/service/app/tools/stationary_energy_start_draft_tools.py` *(new)*
- `climate-advisor/service/app/services/agent_service.py`
- `climate-advisor/service/app/utils/streaming_handler.py`
- `climate-advisor/service/app/services/stationary_energy/stationary_energy_tool_events.py`
- `climate-advisor/prompts/stationary_energy_review.md`

## Verification

- `tsc --noEmit` clean (no errors in source).
- ESLint clean on the touched files (i18next literal-string rule included).
- Jest: the Stationary Energy suites pass (`stationary-energy-*`).
- Climate Advisor image rebuilt + recreated; new modules import, UI-event
  whitelist updated, `/health` OK.
- In-browser pass of every item above, including typing "draft the empty rows"
  → the agent starts a draft, which appears in the sessions list and populates
  the overview.

## Notes & follow-ups

- **Climate Advisor must be rebuilt** to pick up the agent changes (it runs from
  a pre-built image): `docker compose -f climate-advisor/docker-compose.yml build
  climate-advisor && docker compose -f climate-advisor/docker-compose.yml up -d
  --force-recreate climate-advisor`.
- **i18n is EN-only by design** — new keys live in
  `en/stationary-energy-agentic.json`; CI translates the other locales on merge.
- A couple of now-unused start keys (`chat-start-intro`, `chat-start-review-prompt`)
  were left in place to avoid churn; they can be pruned.
- **Known follow-up:** on a brand-new draft the overview panel briefly shows the
  sub-sector skeleton as "queued / 0 of N" before generation; it should read as a
  true empty overview.
- Local-only files (`.env`, `climate-advisor/llm_config.yaml`) are intentionally
  not part of this branch.
