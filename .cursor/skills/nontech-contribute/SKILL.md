---
name: nontech-contribute
description: Guide non-technical contributors through making safe code changes to CityCatalyst. Use when someone without coding experience wants to update text, translations, colors, copy, or small UI details, and needs the agent to handle git, verification, and PR creation for them.
---

# Non-Tech Contribute

Help non-technical team members (product, design, business, data) ship real changes to CityCatalyst. You handle git, verification, and PR creation for them — they only describe the change in plain language.

## When to use

- The user is not an engineer and asks to change something visible: text, translation, color, copy, tooltip, spacing, image, link.
- The user says "I want to change/fix/update…" and does not mention git, branches, or commits.
- The change is small in scope (typically ≤ 5 files). If it grows beyond that or requires architecture decisions, flag it for engineering review.

## Golden rules

- The user never types git commands. You run them.
- Never commit to `develop` or `main` directly — always a new branch.
- One PR per logical change.
- Always run the TypeScript check before committing.
- If the change requires new dependencies, migrations, or architecture decisions, stop and flag it.

## Workflow

### Phase 1 — Understand the change

Ask, in plain language:

1. **What** do you want to change? (text, color, behavior, layout)
2. **Where** in the app is it? (which page, section, button — a screenshot or Jam link helps a lot)
3. **What should it look like after?** (new text, new color hex, new behavior)

Confirm your understanding in one sentence before touching anything.

### Phase 2 — Git setup (automatic)

1. Run `git status` and `git branch --show-current`.
2. If not on a clean branch off `develop`, run:

```bash
git checkout develop && git pull
git checkout -b <username>/<type>-<short-description>
```

**Branch naming:** `<username>/<type>-<short-description>`

- `<username>`: run `git config user.name` and slugify (lowercase, no spaces). If empty, ask the user's first name.
- `<type>`: `fix` (bug/typo), `feat` (new feature/content), `style` (visual), `i18n` (translation), `docs` (documentation), `hotfix` (urgent prod fix).

Examples:

- `brian/fix-spanish-translation-help-button`
- `amanda/feat-add-tooltip-emissions-chart`
- `greta/style-update-sidebar-color`

### Phase 3 — Find and modify

1. Locate the right file(s):
   - **Text / translations:** `app/src/i18n/locales/<lang>/*.json`
   - **Pages / components:** `app/src/app/` (routes) or `app/src/components/`
   - **Colors / theme:** Chakra UI theme in `app/src/lib/theme.ts` (or component-level styles)
   - **API / data:** `app/src/services/` or `app/src/app/api/`
2. Make a minimal, focused edit.
3. Explain the diff in plain language, e.g. *"I changed the button text from 'Need Help' to '¿Necesitas Ayuda?' in the Spanish translation file."*

### Phase 4 — Verify

Quick sanity checks:

```bash
cd app && npx tsc --noEmit 2>&1 | tail -20
git diff --stat
```

For visible changes (translations, colors, copy), also run a lint pass if it is fast:

```bash
cd app && npm run lint -- --quiet 2>&1 | tail -20
```

Fix any errors before proceeding. If you cannot fix them, stop and explain what is blocking.

### Phase 5 — Commit, push, and open the PR (automatic)

Do not ask the user to type git commands.

1. Commit with a Conventional-Commit style subject:

   ```bash
   git add -A
   git commit -m "<type>: <short imperative description>"
   ```

   Types: `fix:`, `feat:`, `style:`, `i18n:`, `docs:`.

2. Push the branch:

   ```bash
   git push -u origin <branch-name>
   ```

3. Open the PR by **delegating to the [dev-pull-request-standards skill](../dev-pull-request-standards/SKILL.md)**. Do not hand-roll a title or body here — that skill owns the format, uses `.github/PULL_REQUEST_TEMPLATE.md`, and picks the right GitHub tool. Give it the plain-language description you got from the user so it can fill:

   - **Summary** — the outcome in the user's own words (1–3 sentences).
   - **Changes** — the minimal bullet list of what was touched.
   - **How to test** — the exact click-path a reviewer can follow (e.g. *"Open `/onboarding` in Spanish and check the header button says 'EDITAR'."*).
   - **Ticket** — only if the user gave you a ticket ID (e.g. `ON-1234`); otherwise omit the section.
   - **Notes** — only for screenshots or callouts the reviewer needs.

### Phase 6 — Hand off

Once the PR is open, tell the user:

- The PR URL.
- Who or which team is expected to review (usually within 24h).
- Where to watch status (GitHub PR page, CI checks).
- Where to ask for help if CI fails (Slack channel).

## Escalate to engineering when

- The change touches more than ~5 files or crosses backend + frontend.
- The change requires a new dependency, migration, environment variable, or feature flag.
- Verification (`tsc`, lint) fails and the fix is not obvious.
- The change is user-facing on a critical path (auth, payments, data export) — even if small.

## Examples

**Input:** "I want the onboarding 'EDIT' button to show 'EDITAR' in Spanish."
**Action:** Find the key in `app/src/i18n/locales/es/*.json`, update the value, `tsc`, commit `i18n: translate onboarding edit button to Spanish`, push, delegate PR creation with a How-to-test that names the page and button.

---

**Input:** "The sidebar color should be darker, like #1a1a2e instead of the current blue."
**Action:** Find the sidebar component or theme token, update the color, `tsc` + lint, commit `style: darken sidebar background`, push, delegate PR creation with a screenshot request in Notes if the user has one.

---

**Input:** "I want to add a tooltip that says 'Values shown in tCO2e' next to the emissions chart."
**Action:** Locate the chart component, wrap the label with a Chakra `Tooltip`, add an i18n key if the copy is user-facing, `tsc`, commit `feat: add tCO2e tooltip on emissions chart`, push, delegate PR creation with a How-to-test pointing to the chart page.
