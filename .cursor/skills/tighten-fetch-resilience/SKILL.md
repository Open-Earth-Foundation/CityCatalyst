---
name: tighten-fetch-resilience
description: Make outbound fetch calls resilient — timeouts, AbortSignal, retries, error wrapping. Use when reviewing or writing any fetch / axios / httpx call that hits an external service (HIAP, Global API, OpenAI, OpenClimate, CCRA).
---

# tighten-fetch-resilience

CityCatalyst calls multiple external services. Without timeouts, a hung upstream **freezes the user's browser tab**. This skill is mandatory for every external call.

## Required pattern (TypeScript / Next.js)

```ts
import { logger } from "@/services/logger";

const FETCH_TIMEOUT_MS = 30_000;       // default; bump consciously, never remove

export async function callHiap(input: HiapInput): Promise<HiapOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${process.env.HIAP_API_URL}/v1/rank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HIAP responded ${res.status}`);
    }
    return (await res.json()) as HiapOutput;
  } catch (err) {
    logger.error({ err, url: process.env.HIAP_API_URL }, "HIAP call failed");
    throw err;                         // let apiHandler turn this into 502
  } finally {
    clearTimeout(timeout);
  }
}
```

## Required pattern (Python / httpx)

```python
import httpx
from logging import getLogger

logger = getLogger(__name__)
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

async def call_global_api(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        try:
            resp = await client.post(f"{settings.global_api_url}/v1/x", json=payload)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            logger.exception("global-api call failed: %s", exc)
            raise
```

## Background tasks

If the call is not awaited inline (e.g. fire-and-forget), wrap it:

```ts
void doBackgroundWork()
  .catch((err) => logger.error({ err }, "background work failed"));
```

For HIAP "start both" pattern (ROADMAP §1.3), explicitly `.catch()` the second job:

```ts
await startMitigationRanking(input);
startAdaptationRanking(input)              // not awaited on purpose
  .catch((err) => logger.error({ err }, "adaptation ranking failed"));
```

## Retries

- Don't blanket-retry. Most failures are 4xx (bug) or sustained 5xx (upstream broken).
- For transient network errors, retry once with 1s backoff. Use `p-retry` if a custom policy is needed.

## Where to find existing helpers

Before writing a new fetch wrapper, check:

- `app/src/services/`  — RTK Query handles retries via `fetchBaseQuery` config; reuse it for in-app API calls.
- `app/src/lib/integrations/` — wrappers for external services (if present).
- Python services — there's usually a `clients/` folder per service.

If you find duplication, **extract** it into a shared helper rather than a third copy.

## Anti-patterns

- `await fetch(url)` with no timeout. Banned for any non-localhost URL.
- `fetch(...).then(...).catch(...)` mixed with `async/await`. Pick one.
- `try { await x } catch (e) { console.error(e) }` and swallow. Either rethrow or surface as a typed error.
- Re-implementing JSON-parsing / status-handling in every call site.
