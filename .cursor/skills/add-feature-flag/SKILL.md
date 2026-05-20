---
name: add-feature-flag
description: Add a feature flag end-to-end (env, util, gating in UI / API). Use when the user asks to add a feature flag, gate a feature, or A/B-test something.
---

# add-feature-flag

CityCatalyst flags live in `app/src/util/feature-flags.ts` and are sourced from `NEXT_PUBLIC_FEATURE_FLAGS`.

## Workflow

### Step 1 — Pick a flag name

Use SCREAMING_SNAKE_CASE, prefixed with the surface:

```
UI_NEW_ONBOARDING
API_HIAP_RANKINGS_V2
ADMIN_MODULE_TOGGLE
```

### Step 2 — Add the flag

In `app/src/util/feature-flags.ts`, add the flag and its default. Both `NEXT_PUBLIC_FEATURE_FLAGS` (client) and `FEATURE_FLAGS` (server, if used) should know about it.

```ts
export const FeatureFlags = {
  UI_NEW_ONBOARDING: "UI_NEW_ONBOARDING",
  // ...
} as const;

export type FeatureFlag = keyof typeof FeatureFlags;
```

### Step 3 — Gate the code

```ts
import { isFeatureEnabled } from "@/util/feature-flags";

if (isFeatureEnabled("UI_NEW_ONBOARDING")) {
  // new behaviour
} else {
  // old behaviour (still the safe path until rollout)
}
```

### Step 4 — Document in `.env.example`

```
# Comma-separated list of enabled flags. See src/util/feature-flags.ts for the catalogue.
NEXT_PUBLIC_FEATURE_FLAGS=UI_NEW_ONBOARDING,API_HIAP_RANKINGS_V2
```

If the flag has a server-side counterpart, document `FEATURE_FLAGS` separately. **Do not duplicate** entries in `.env.example` (we've shipped that bug before — see `pborges/fix-duplicate-feature-flags-env-example`).

### Step 5 — Roll-out plan in the PR description

In the PR body, include:

- **What** the flag does.
- **Default** state (off, almost always).
- **Who** can flip it (env-driven, ops only).
- **Removal plan** — when the flag goes away (e.g. "after 2 successful demos with the new onboarding").

## Anti-patterns

- Flags without removal plans → they become permanent forks.
- Flags read from `process.env` directly inside components → use `isFeatureEnabled`.
- Flags that gate **destructive** behaviour (deletes, migrations) — these need a CTO sign-off, not a flag.
