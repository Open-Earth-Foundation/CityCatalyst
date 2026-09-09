---
name: non-tech-contribute
description: Help a contributor who explicitly wants non-technical assistance make a small CityCatalyst text, translation, or UI change, including git and PR handling when authorized. Do not infer coding experience from omitted git terminology.
---

# Non-Tech Contribute

Turn a plain-language request into a small, reviewable change. Handle the technical work; explain decisions and results in language the contributor can assess.

## Scope and authorization

- Use this workflow when the user identifies as non-technical or explicitly asks for help handling the contribution process. A request that omits branches or commits is not enough to select it.
- Keep one logical change per branch/PR. Never commit directly to `develop` or `main`.
- A request to edit authorizes the scoped local edit and relevant validation. Commit, push, or create/update a PR only when those actions are requested or already authorized. A request to implement a change and open its PR includes publishing the necessary feature branch.
- If publication is not authorized, finish the local change and verification, then present the concrete diff before asking about publishing. Do not ask again for authorization already given.
- Treat more than roughly five affected files as a reason to reassess scope, not an automatic failure. For new dependencies, migrations, architecture decisions, or critical auth/payment/export behavior, explain the engineering decision needed and complete any independent authorized work first.

## Workflow

### 1. Understand the requested outcome

Infer what, where, and the desired result from the request and available screenshots or repository context. Ask only for missing information that would materially change the result. Do not repeat questions already answered or require confirmation of a complete request before inspecting files.

### 2. Prepare an isolated branch

1. Inspect `git status --short`, the current branch, and any existing task branch or PR.
2. Reuse an appropriate task branch when continuing the same change. Otherwise fetch `origin develop` and create a feature branch from it.
3. If the working tree contains unrelated edits, preserve them. Use a separate worktree for the new branch; do not switch the dirty checkout, stash, reset, or stage someone else's work. If user changes overlap the requested edit and isolation would omit needed work, ask how to combine them.
4. Use `<username>/<type>-<short-description>` when the username is known, or a descriptive `<type>/<short-description>` branch. A missing display name is not a reason to block the edit.

### 3. Make the scoped edit

Locate the actual implementation before editing:

| Change | Starting point |
| --- | --- |
| Text or translation | `app/src/i18n/locales/<lang>/` |
| Page or component | `app/src/app/` or `app/src/components/` |
| Colors | `app/src/lib/theme/` and the component's semantic tokens |
| Client data or API | `app/src/services/` or `app/src/app/api/` |

Follow `app/AGENTS.md`. Add new translation keys in English for CI translation; an explicitly requested correction to an existing locale may edit that locale's value. Use semantic color tokens and project UI wrappers. Explain the changed behavior briefly.

### 4. Verify the change

- For TypeScript changes, run `npx tsc --noEmit` from `app/`; preserve the exit status and inspect the useful error output.
- For supported changed files, run targeted ESLint/Prettier checks with explicit paths. Do not format the entire app for a small edit.
- For translation-only edits, validate JSON and preserve key/interpolation contracts. For visible UI changes, inspect the affected screen when a preview is available.
- Run additional tests when affected behavior or required CI checks justify them.
- Fix errors introduced by this change. Compare with the base when needed to distinguish pre-existing failures; do not repair unrelated failures just to get a green run. Report missing dependencies or unavailable checks accurately.
- Finish once the relevant checks and required post-change inspections are complete. Inspect the final diff for unintended files or hunks.

### 5. Publish when authorized

1. Stage only the intended files/hunks using explicit paths or selective staging. Do not use `git add -A`.
2. Review `git diff --cached` to confirm that the commit contains only this task's change.
3. Commit with a concise Conventional Commit subject, such as `i18n: correct onboarding button translation`.
4. Push only the task branch when authorized. Do not force-push.
5. Use [pull-request-standards](../pull-request-standards/SKILL.md) to create or update the PR. Preserve a requested draft state and use the repository template. Include a concrete screen/language/click path in **How to test** when useful.

### 6. Hand off

Return the PR URL when published, summarize the visible change and validation, and identify any remaining blocker. Name a reviewer, review timeframe, or support channel only when repository or user context actually establishes it.
