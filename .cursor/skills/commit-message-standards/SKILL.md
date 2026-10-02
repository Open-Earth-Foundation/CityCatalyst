---
name: commit-message-standards
description: Generate Conventional Commits messages for CityCatalyst. Use whenever the user asks for a commit message, asks to commit changes, or you need to write the body of a commit. Pairs with pull-request-standards.
---

# commit-message-standards

CityCatalyst uses **Conventional Commits** with optional ticket references.

## Output format

```
<type>(<scope>): <imperative summary>   # ≤72 chars

<body — wrap at 72 chars, explain WHY, not WHAT>

<footer — Refs: ON-####, BREAKING CHANGE: …>
```

Wrap **every** line at 72 chars. The first line is also ≤ 72.

## Allowed `<type>`

`feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.

## Allowed `<scope>` (recommended set)

`app`, `api`, `ui`, `auth`, `db`, `i18n`, `hiap`, `meed`, `advisor`, `global-api`, `k8s`, `ci`, `deps`, plus a feature name if obvious (`onboarding`, `inventory`).

## Workflow

1. **Inspect the diff** — `git diff --cached --stat` (or `git diff --stat HEAD~1` if already committed).
2. **Pick `<type>`**:
   - new user-visible behaviour → `feat`
   - bug fix (no new feature) → `fix`
   - non-functional cleanup, deps, CI → `chore` / `ci` / `build`
   - perf improvement (measurable) → `perf`
   - pure refactor (no behaviour change) → `refactor`
   - docs only → `docs`
   - tests only → `test`
3. **Pick `<scope>`** from the allowed set; omit `()` if cross-cutting.
4. **Write the summary** (imperative, ≤72 chars, no trailing period).
5. **Body (optional but encouraged for non-trivial changes)**:
   - Why this change exists (not what — the diff shows what).
   - Trade-offs you made.
   - Things you intentionally did **not** change.
6. **Footer**:
   - `Refs: ON-####` if a ticket exists.
   - `BREAKING CHANGE: <description>` if behaviour changes for callers.

## Examples

```
feat(api): add /widgets endpoint with Zod validation (ON-5512)

Adds CRUD endpoints for the new Widget resource introduced in
ON-5500. Uses the standard apiHandler wrapper, Zod validation,
and a WidgetService to keep the route handler thin.

Refs: ON-5512
```

```
fix(ui): prevent freeze when language switches mid-page (ON-5532)

Switching language re-runs the i18n loader synchronously, which
under React 18 strict mode can suspend the page tree without a
boundary. Wrap the loader in a Suspense boundary scoped to the
locale provider to keep the page interactive.

Refs: ON-5532
```

```
chore(deps): bump fastapi 0.128 → 0.135 in /climate-advisor
```

```
refactor(api): split services/api.ts into per-domain slices

Splits the 2171-line file into:
- services/api/inventory.ts
- services/api/city.ts
- services/api/user.ts
- services/api/index.ts (combined export)

No public API change; all hooks remain importable from
@/services/api.

Refs: ON-5601
```

## Anti-patterns

- `wip`, `fix stuff`, `update`, `changes` — banned.
- `Update file foo.ts` — describes the diff, not the change. Banned.
- `WIP: x` — banned. Squash before pushing.
- Trailing period in subject — banned.
- ALL CAPS in subject — banned.
- Multiple unrelated changes in one commit — split.

## Generating the message via Cursor

When the user asks "write a commit message for what I have staged":

1. Read `git diff --cached` (use `Shell` tool).
2. Apply this skill.
3. **Print the message ready to paste into `git commit -m "$(cat <<'EOF' … EOF)"`.** Do not run the commit unless explicitly told.
