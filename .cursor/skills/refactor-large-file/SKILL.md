---
name: refactor-large-file
description: Plan and execute a safe split of a large file (>1000 LOC, especially `services/api.ts`). Use when the user asks to split, decompose, or refactor a large file.
---

# refactor-large-file

`app/src/services/api.ts` is currently ~2171 lines. Other suspects: `src/util/api.ts`, certain feature `index.ts` files. This skill is the safe pattern.

## Pre-conditions

Before splitting, confirm:

- The file is genuinely large (`wc -l <file>` > 1000).
- It has clear "domain" sections (comments, big consts, group of endpoints, etc.).
- Tests exist for the public exports — or you write a smoke test first.

If any of those are false, **stop**. Splitting noisy code is a regression risk.

## Workflow (using `services/api.ts` as the canonical example)

### Step 1 — Map the file

Identify groups by domain:

```
inventory   → ~600 lines
city        → ~400 lines
user        → ~300 lines
organization → ~250 lines
project     → ~200 lines
hiap        → ~200 lines
other       → ~200 lines
```

### Step 2 — Create the per-domain modules

```
services/api/
├── index.ts          # combined export, the only public symbol
├── _base.ts          # createApi base + tagTypes
├── inventory.ts
├── city.ts
├── user.ts
├── organization.ts
├── project.ts
└── hiap.ts
```

`_base.ts`:

```ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
export const baseApi = createApi({
  reducerPath: "api",
  tagTypes: ["UserInfo", /* ... */],
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v1/", credentials: "include" }),
  endpoints: () => ({}),
});
```

Per-domain (uses `injectEndpoints` so the slice stays one):

```ts
import { baseApi } from "./_base";
export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInventory: builder.query<...>({ ... }),
    // ...
  }),
});
export const { useGetInventoryQuery, ... } = inventoryApi;
```

`index.ts`:

```ts
export * from "./_base";
export * from "./inventory";
export * from "./city";
// ...
export { baseApi as api };   // keep `import { api } from "@/services/api"` working
```

### Step 3 — Move endpoints in **one PR per domain**

Do not move all domains in one PR. Each domain:

1. Cut the endpoints from the monolith.
2. Re-export from `index.ts` so the public surface is unchanged.
3. Run `npm run jest && npm run lint && npm run openapi:lint`.
4. Open a PR — small, reviewable.

### Step 4 — After all domains moved

Delete the empty monolith. Update `app/README.md` if it references the old path.

## Anti-patterns

- "Big bang" rewrite in one PR. Too risky to review.
- Renaming or changing endpoint signatures during the split — that's a different PR.
- Introducing a new abstraction "while I'm here." `injectEndpoints` is enough.

## Why `injectEndpoints` and not new `createApi`s

A new `createApi` means a new reducer key, new middleware, new cache. The whole point is **no behaviour change** — `injectEndpoints` extends the same store slice.
