# Runtime public environment variables

CityCatalyst replaces `next-runtime-env` with a small in-app helper under
`src/lib/runtime-env/`.

Next.js inlines `NEXT_PUBLIC_*` values at **build** time. For Kubernetes and
other container deploys we often need those values to come from the **runtime**
environment of the pod. This module injects them into the browser on each
request so client code can read deployment-specific values without rebuilding
the image.

## How it works

```
Server (request)                         Browser
─────────────────                        ───────
process.env.NEXT_PUBLIC_*
        │
        ▼
RuntimeEnvScript (Server Component
in app/[lng]/layout.tsx)
        │
        ▼
<script>window.__ENV = { ... }</script>
                                         env("NEXT_PUBLIC_…")
                                              │
                                              ▼
                                         window.__ENV[…]
```

| Piece | Role |
|-------|------|
| `RuntimeEnvScript` | Async Server Component that serializes allowlisted vars into `window.__ENV` |
| `PUBLIC_RUNTIME_ENV_KEYS` / `getPublicRuntimeEnv()` | Allowlist + server-side read of `process.env` |
| `env(key)` | Client: `window.__ENV`; Server: `process.env` |
| `global.d.ts` | Types `window.__ENV` |

`RuntimeEnvScript` calls `connection()` from `next/server` before reading
`process.env`. Without that, Next can statically prerender the layout at
`npm run build` (when Docker has no public env) and bake `window.__ENV={}`
into HTML — so k8s runtime flags never reach the browser.

Do **not** add `"use server"` to these files. That directive marks Server
Actions, not Server Components. `RuntimeEnvScript` is a normal RSC (no
`"use client"`).

## Reading values in code

```ts
import { env } from "@/lib/runtime-env";

// Prefer this for any allowlisted NEXT_PUBLIC_* used in client or shared code
const flags = env("NEXT_PUBLIC_FEATURE_FLAGS");
const support = env("NEXT_PUBLIC_SUPPORT_EMAILS");
```

Guidelines:

- **Client / shared UI**: always use `env("NEXT_PUBLIC_…")` for allowlisted keys.
- **Server-only modules** (e.g. some backends, proxy): `process.env` is fine when
  the value is never needed in the browser.
- Do not use `process.env.NEXT_PUBLIC_*` in Client Components — the build-time
  inlined value will ignore k8s/runtime overrides.

## Adding a new public env var

1. Add the var to deploy/CI config (GitHub Actions, k8s manifests, `.env` / `.env.example` as appropriate).
2. Append the key to `PUBLIC_RUNTIME_ENV_KEYS` in `src/lib/runtime-env/keys.ts`.
3. Read it with `env("NEXT_PUBLIC_YOUR_KEY")` anywhere the browser (or shared code) needs it.

If you skip step 2, `env()` on the client will return `undefined` even if the
pod has the variable set.

## Current allowlist

See `src/lib/runtime-env/keys.ts` for the source of truth. At time of writing:

- `NEXT_PUBLIC_FEATURE_FLAGS`
- `NEXT_PUBLIC_OPENCLIMATE_API_URL`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_DEPLOYMENT_ENV`
- `NEXT_PUBLIC_SUPPORT_EMAILS`
- `NEXT_PUBLIC_CC_CCRA_REPLIT_URL`
- `NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID`

## Local development

With `npm run dev`, `RuntimeEnvScript` still injects from your local `.env` /
process environment. Client code that uses `env()` will see those values via
`window.__ENV` after the layout loads.

### Verifying runtime injection (production build)

Dev mode can hide static-prerender bugs. To match k8s:

1. Build **without** allowlisted public env (or with them unset).
2. Start with the vars set, e.g. `NEXT_PUBLIC_FEATURE_FLAGS=... npm start`.
3. Open `/en/` and confirm `window.__ENV` is non-empty (not `{}`).

If step 3 is empty, request-time injection is still broken.

## Related docs

- Feature flags (parsed from `NEXT_PUBLIC_FEATURE_FLAGS`): [QA_FEATURE_FLAGS.md](./QA_FEATURE_FLAGS.md)
- App conventions: [../AGENTS.md](../AGENTS.md)
