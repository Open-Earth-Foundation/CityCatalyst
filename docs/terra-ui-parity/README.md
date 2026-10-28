# Terra UI ↔ CityCatalyst parity

Open [`index.html`](./index.html) in a browser. No build, no server — it's self-contained.

There's also a [hosted copy](https://claude.ai/code/artifact/3de11a51-9f25-4bf5-b73c-0e87849826f0) for anyone who'd rather not clone the repo. It's access-controlled and shared with the Open Earth team — if it asks you to sign in and you're outside the team, use the local file instead. It's a point-in-time snapshot, so treat `index.html` in this repo as the source of truth.

## What this is

A structural comparison between the **CC Terra UI Guidelines** Figma library and the Chakra v3 theme in `app/src/lib/theme/`. It exists to answer three questions we couldn't answer before:

1. Which design tokens exist on both sides, and under what names?
2. Which are defined and never used — in either direction?
3. Where does the handoff actually break?

Scoped to the **CityCatalyst brand theme**. The five other `data-theme` palettes are per-organization white-labelling — a product feature, not a design-system concern.

## What it found

**The color vocabulary is already shared.** All 25 color tokens in Terra UI's `Colors` collection exist in the theme under corresponding names. This was the open risk and it came back clean — alignment here is bookkeeping, not a rewrite.

**Naming drift is causing live bugs.** 19 references across 17 files point at font-size tokens that don't exist, and most are Figma's style names typed verbatim: Figma says `Body/large`, the theme says `body.lg`, and `fontSize="body.large"` appears 6 times. Chakra silently drops an unresolvable token, so the text renders at browser default. No build error, no lint rule, nothing in review.

**`content.tertiary` reports the wrong value.** The token file defines it twice — a raw `#7A7B9A` and a semantic `#4B4C63`. Semantic wins, so `#4B4C63` renders, but the raw line is the one you find when you search, and it's annotated `// validated`. It's the most-used color in the product (377 refs). `#7A7B9A` is hardcoded ~80 times in `icons.tsx`.

**`semantic.*` is an undocumented shadow of `sentiment.*`.** Six of seven values are byte-identical to a `sentiment.*` token Terra UI actually defines. The seventh disagrees: `semantic.warning` is `#C98300`, `sentiment.warningDefault` is `#F9A200`. Two warning colors depending on which name a developer reached for. 44 usages on the namespace design has never seen.

**Breakpoints were implemented, then commented out.** `app-theme.ts:694–702` holds a five-step scale whose boundaries match Terra UI's grid styles exactly — `600`, `905`, `1240`, `1440` — inside a block comment. Somebody did the handoff correctly and it was switched off without explanation.

**Terra UI ships duplicate token collections.** Spacing and radius each exist twice: a semantic set that maps 1:1 to the theme, and a numeric `Primitives` set that maps to nothing. One is legacy; nobody has said which.

**Part of the component library is Chakra v2.** Switch and Checkbox carry `colorScheme=blue|cyan|green|pink|purple|teal` — a prop that doesn't exist in v3. Alert uses `variant=left-accent|solid|subtle|top-accent` against a codebase with no Alert. Table uses `variant=Simple|Striped|Unstyled` against an in-house `data-table`. These look inherited from a Chakra v2 Figma kit rather than authored for Terra, and can't be handed off as specified.

**Design specifies disabled everywhere; code implements it nowhere.** Figma models `State=Disabled` across tabs, inputs, checkboxes and switches. Every recipe in the theme has 10 `_hover`, 6 `_active`, 5 `_loading` and zero `_disabled`.

## Unused

Defined and never consumed: `brand.50/400/600/800/900`, `brandScheme.100/500`, `sectors.I–V`, `background.backgroundDisabled`, `caption`. In Figma: `Label/underline` ×3 has no implementation, and `4dp`/`8dp`/`12dp` are defined on both sides and used by neither.

`sectors.I–V` is worth a look — the colors *are* used, but charts import the `SectorColors` enum directly, so the Chakra token registration is redundant.

## Limits

Names and structure only, not values. The Figma REST search returns style names and descriptions but not resolved hex or font specs, so **a green row means the token exists on both sides, not that the hex agrees.** Confirming values needs a Desktop Bridge extraction (Figma Desktop → Plugins → Development → Figma Desktop Bridge). Code values in the table are read from `app-theme.ts` and are accurate.

The component section is a structural read of variant APIs sampled from the guidelines page, not a visual diff.

This page is hand-authored and does **not** track the codebase. It will go stale. That's the argument for what's below.

---

## Proposal for the dev team: make this live

The static page can't render real components — it compares Figma against a transcription. The version worth building is a guarded route inside the app that renders the **actual** React components against Figma-extracted specs, so parity is computed at runtime and can't silently drift.

The concern is shipping a dev-only surface to production. Five layers, strongest first:

**1. The route doesn't exist in production builds.** `next.config.mjs` sets no `pageExtensions` today. Name the file `page.dev.tsx` and include the `dev.tsx` extension only under a build flag — Next never compiles it in production. Not a runtime check that could be bypassed; an absence.

**2. Server-side feature flag → 404.** Add `DESIGN_PLAYGROUND` to `FeatureFlags` and reuse the existing guard verbatim from `src/backend/agentic/ghgi/stationary-energy/page-guard.ts`.

Use `hasServerFeatureFlag()`, not `hasFeatureFlag()`. The client variant checks `localStorage` first, and `feature-flags.ts:266` exposes `window.qaFlags.set()` globally — anyone can flip a client flag from the console.

**3. Admin check, server-side.** Note the existing admin guard in `app/[lng]/admin/layout.tsx:39` is `useSession()` inside a `"use client"` layout — a UI guard, not a boundary; children still reach the browser in the RSC payload. Use `getServerSession` in a server component and 404 non-admins.

**4. Nothing behind it.** Fixtures only — no RTK Query, no DB, no org or inventory context. Even fully exposed there's no data to leak.

**5. Middleware + noindex + a CI test** asserting 404 when the flag is off. `middleware.ts` already wraps everything non-public in `withAuth`.

Layers 1 and 2 are the real answer; the rest is depth.

**What it would buy us**, beyond what the static page does: the 19 broken font-size references would have been caught the day they landed. A runtime check comparing every token referenced in code against the theme's actual token set is a dozen lines, and it's the difference between a document that describes the drift and a tool that prevents it.
