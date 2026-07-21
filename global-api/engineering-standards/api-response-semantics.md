# API Response Semantics — v2 Conformance Standard

This document defines what the **response body** of a CityCatalyst Global API endpoint must
contain. [`api-design.md`](./api-design.md) governs the *outside* of an endpoint — URLs,
versioning, parameters, errors. This document governs the *inside* — the shape and meaning of
what comes back. It works alongside [`data-model-design.md`](./data-model-design.md), which
guarantees the provenance and units this standard surfaces.

It also defines what **v2** means. Conformance to this standard is the bar an endpoint must clear
to live under `/api/v2`.

---

## Guiding Principle

**Meaning is a property of the data, not a feature of the client.**

A bare number is not an answer. `1234567` is meaningless until you know it is tonnes of CO₂e,
Scope 1 stationary energy, 2022, AR5, from a named source. Today that context lives in field
names, URL segments, and tribal knowledge — so every consumer (the app, a notebook, the MCP
server, the next integration) has to reconstruct it, and they do so inconsistently.

The fix is to make every value **self-describing**: it travels with its unit, its calculation
context, its provenance, and — when absent — the reason it is absent. The API states the meaning
once; every consumer reads it the same way.

This is not aspirational. It is the contract a v2 endpoint signs.

---

## What "v2" Means

`v2` is **not a folder** and **not a per-endpoint counter**. It is the name of a contract
generation — a quality mark. Everything under `/api/v2` conforms to this standard, by definition.
An endpoint "becomes v2" when it passes the [Conformance Checklist](#conformance-checklist), not
when it is moved.

- There is one current clean generation. Consumers point at `/api/v2` and know what they get.
- `v0` and `v1` remain live and frozen for existing consumers (e.g. HIAP). They are *the old API*,
  not "resource X's version." No consumer is forced to migrate on our schedule.
- Endpoints join `/api/v2` incrementally, resource by resource (strangler migration). Until an
  endpoint conforms, it stays where it is.

A version bump is still triggered only by a breaking change, per `api-design.md`. The point of v2
is that the break is *intentional and uniform*: it is the move to self-describing responses.

---

## The Reference Observation

Every measured value a v2 endpoint returns is an **Observation**: a value plus the envelope that
makes it interpretable. JSON keys are `camelCase` per `api-design.md`. Numeric values are JSON
numbers, never strings.

```jsonc
{
  "value": 1234567.0,         // JSON number, never a string
  "unit": "tCO2e",            // explicit unit — required on every measured value
  "gwp": "ar5",               // calculation context, echoed (not just accepted as input)
  "timeHorizonYears": 100,    // disambiguates co2eq_100yr vs co2eq_20yr in the payload, not the key name
  "dataQuality": "medium",    // the gpc_quality / DQ flag, surfaced
  "notationKey": null         // null when a real value exists; otherwise a NotationKey object (below)
}
```

When there is **no value**, `value` is `null` and `notationKey` carries the reason. A missing
value must be self-explaining — never an ambiguous `0`, `""`, `"empty"`, or a bare `404`:

```jsonc
{
  "value": null,
  "unit": "tCO2e",
  "gwp": "ar5",
  "timeHorizonYears": 100,
  "dataQuality": null,
  "notationKey": {
    "key": "NO",
    "name": "not-occurring",
    "reason":      { "en": "The activity does not occur within the city", "pt": "...", "es": "..." },
    "explanation": { "en": "No facilities found within the city boundary",  "pt": "...", "es": "..." }
  }
}
```

> The notation-key content already exists in `routes/ghgi_notation_key.py`. v2 folds it **into**
> the observation rather than requiring a second call to a separate endpoint. `null`, `0`,
> `"empty"`, and a notation key are four distinct meanings in GHG accounting; the response must
> keep them distinct.

---

## The Response Envelope

A v2 response wraps observations in two blocks: `meta` (what was asked) and `data` (what was
found, including where it came from). This mirrors the pattern already used by
`routes/finance_opportunities.py`.

```jsonc
{
  "meta": {
    "generatedAtUtc": "2026-06-26T10:00:00Z",
    "endpoint": "/api/v2/cities/BRSER/emissions",
    "request": {                       // echo the resolved request so the body is self-identifying
      "datasourceName": "SEEG",
      "emissionsYear": 2022,
      "gpcRef": "II.1.1",
      "gwp": "ar5"
    }
  },
  "data": {
    "actorId": "BR SER",
    "gpcReferenceNumber": "II.1.1",
    "reportingYear": 2022,
    "total": {                         // an Observation
      "value": 1234567.0,
      "unit": "tCO2e",
      "gwp": "ar5",
      "timeHorizonYears": 100,
      "dataQuality": "medium",
      "notationKey": null
    },
    "gases": [                         // per-gas Observations, same envelope
      { "gas": "CO2", "mass": { "value": 1200000.0, "unit": "t" }, "co2eq": { "value": 1200000.0, "unit": "tCO2e", "timeHorizonYears": 100 } }
    ],
    "provenance": {                    // resolved from release_id -> modelled.dataset_release
      "releaseId": "…",
      "publisherId": "…",
      "datasetId": "…",
      "versionLabel": "2023.1",
      "sourceUrl": "https://…",
      "retrievedAt": "2025-09-01T00:00:00Z",
      "isLatest": true
    }
  }
}
```

Provenance is never invented at the API layer. It is read from the `release_id` →
`modelled.dataset_release` chain that `data-model-design.md` already requires on every
data-bearing row. If a row cannot be traced to a release, that is a data-model gap to fix, not a
field to fabricate.

---

## Anti-Pattern → v2 (emissions)

The current emissions endpoint (`routes/ghgi_emissions.py`) is the canonical thing v2 fixes:

```jsonc
// v0/v1 — meaning lives in field names and the URL, values are strings, no provenance, no units
{
  "totals": { "emissions": {
    "co2eq_100yr": "1234567",   // string; unit only implied by the key; no source; no quality echoed cleanly
    "co2eq_20yr":  "1500000",
    "gpc_quality": ""
  } },
  "records": [ … ]
}
```

Versus a conforming v2 body (above): typed numbers, explicit `unit`, `gwp`/`timeHorizonYears` in
the payload, `dataQuality` as a real value, `provenance` resolved from the release, notation key
folded in, request echoed in `meta`.

Note that `routes/finance_opportunities.py` and `routes/action_legal_assessments.py` already do
most of this — typed values via `_normalize_value`, camelCase keys, release-based provenance, and
a `meta` block. They are the **reference implementation**; emissions is the migration target.

---

## Conformance Checklist

An endpoint may live under `/api/v2` only when **all** of the following hold. Use this as the PR
review checklist for any v2 endpoint.

1. **URL & params** follow `api-design.md` grammar — resource nouns, path identifies / query
   filters, no path-packed filter lists (e.g. not `/source/{ds}/{gran}/{actor}/{gpc}/{year}`).
2. **JSON keys are `camelCase`**, consistently, across the whole body.
3. **Numeric values are JSON numbers**, never strings.
4. **Every measured value carries an explicit `unit`.** No unit-by-field-name.
5. **Calculation context is echoed in the payload** where it affects the value — `gwp`,
   `timeHorizonYears` — not only accepted as input.
6. **Provenance is present and resolved.** Every data row traces to a `modelled.dataset_release`
   (`releaseId` plus the resolved publisher / `versionLabel` / `sourceUrl` / `retrievedAt`).
7. **The datasource/dataset is registered in the catalog** and the endpoint is discoverable
   through it. (This is the gap on newer tables — closing it is part of becoming v2.)
8. **Missing data uses notation keys, not ambiguity.** No bare `0`, `""`, `"empty"`, or
   unexplained `404` where a notation key (`NO` / `IE` / `NE`) carries the real meaning.
9. **A `meta` block echoes the resolved request** — `endpoint`, `request`/filters,
   `generatedAtUtc` — so a detached response identifies itself.
10. **Errors follow `api-design.md`** — `404` for not-found / no-data, `400` for invalid params,
    a `detail` body; never `200` with a null payload.

---

## Why This Comes Before the MCP

The MCP server's quality is capped by this contract. If the API emits self-describing
observations, the MCP becomes a thin, faithful pass-through — it surfaces meaning instead of
manufacturing it, and so does every other consumer. Each line of the checklist above is a piece
of "meaning" the MCP (and the app, and any notebook) gets for free. Build the standard first; the
MCP then inherits it.

---

## Migration Pointer

The rollout (strangler approach, frozen v0/v1, first slice selection, MCP-on-the-slice proof) is
tracked separately. In brief: the **finance / action** resources are the first slice — they are
already closest to this standard, so the first migration validates the standard itself on a
friendly case before it is applied to emissions and the long tail.
