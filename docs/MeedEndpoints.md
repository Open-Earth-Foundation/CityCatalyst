# MEED+ endpoint inventory

Every network boundary the Actions & Plans v2 (MEED+) module crosses, in one
place, so the wiring does not have to be re-derived from the code each time.

The frontend never calls hiap-meed or the Global API directly. Every request
goes through a CityCatalyst route, which is what keeps the surface small: the
ranking route is the only new boundary the prioritizer integration added.

```
  browser ──► CityCatalyst API ──┬──► Global API      (reference data)
                                 └──► hiap-meed       (ranking)
```

## 1. Frontend → CityCatalyst API

Base `/api/v1/`, declared as RTK Query endpoints in `app/src/services/api.ts`.
All MEED routes authorise the caller before doing any work.

### MEED-specific

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `city/{cityId}/modules/meed/actions` | Action catalog (102 mitigation actions) | `findUserCity` |
| GET | `city/{cityId}/modules/meed/city-attributes` | Socioeconomic context | `findUserCity` |
| GET | `city/{cityId}/modules/meed/policy-scores` | Policy-alignment scores per action | `findUserCity` |
| GET | `city/{cityId}/modules/meed/finance/feasibility` | Climate-finance feasibility | `findUserCity` |
| GET | `city/{cityId}/modules/meed/finance/follow?link=` | Follows a Global API link | `findUserCity` |
| GET | `city/{cityId}/meed/rank?inventoryId={uuid}` | Stored ranking for one inventory | `canAccessInventory` |
| POST | `city/{cityId}/meed/rank` | Runs the ranking, stores it, returns it | `canAccessInventory` |

The five `modules/meed/*` routes are thin Global API proxies and share the
`"Meed"` RTK cache tag. The two `meed/rank` routes use a separate
`"MeedRanking"` tag, so running a ranking does not invalidate catalog and
reference data that a ranking cannot change.

Both rank verbs return the same envelope:

```jsonc
{ "data": { "rankedActions": [...], "removedActions": [...] } }
```

Its model is camelCase; our internal types are the prioritizer's snake_case.
The two are bridged in `MEED/meedRankingAdapter.ts` and nowhere else.

### Shared CityCatalyst endpoints the MEED screens also use

| Path | Used for |
|---|---|
| `inventory/{inventoryId}` | inventory + city, incl. locode |
| `inventory/{inventoryId}/results` | emissions totals |
| `inventory/{inventoryId}/results/{sector}` | sector breakdown |
| `city/{cityId}` | city record |
| `city/{cityId}/inventory` | inventory switcher |
| `city/{cityId}/population/{year}` | population |
| `/user` | session user |

## 2. CityCatalyst → hiap-meed (the MEED service)

Base `HIAP_MEED_API_URL` + `/v1/`, called from `app/src/backend/MeedApiService.ts`.

| Method | Path | Called by |
|---|---|---|
| POST | `/v1/prioritize` | `POST city/{cityId}/meed/rank` |

**One endpoint, and only one.** `MeedApiService.runRanking` enriches the
request with `locode`, `countryCode`, `populationSize` and `cityEmissionsData`
built from the CityCatalyst database using `inventoryId` — the frontend must
not send those.

Three further hiap-meed endpoints are modelled in `app/src/util/types/meed.ts`
but wired to nothing:

- `/v1/prioritize/exclusions/preview` — the reason pre-flight computes
  exclusion proposals locally from the catalog instead of asking the service.
- `/v1/reports/output-plan`
- `/v1/explanations/translate`

## 3. CityCatalyst → Global API

Base `GLOBAL_API_URL`, via `app/src/backend/meed/MeedGlobalApiService.ts`.
Every method swallows errors and returns `null`, so screens render empty states
rather than failing.

| Path | Feeds |
|---|---|
| `/api/v1/action-pathways` | action catalog |
| `/api/v0/city_attributes/{locode}` | socioeconomic context |
| `/api/v1/cities/{locode}/action-policy-scores` | policy alignment |
| `/api/v1/cities/{locode}/climate-finance/feasibility` | finance feasibility |
| `/api/v1/cities/…` | `followLink` passthrough |

### Three things to know about this layer

- **`city_attributes` is `v0`** while everything else is `v1`. This is also the
  endpoint that 404s for `BR SAO`, which is why São Paulo shows no
  socioeconomic context. Worth confirming the version is deliberate.
- **`followLink` turns a client-supplied string into a server-side URL.** The
  only constraint is a prefix check — anything not starting with
  `/api/v1/cities/` is rejected. That allowlist is the whole guard.
- **`action-pathways` is fetched without `lang`.** Upstream can return
  multilingual maps for `actionName`/`description` under `lang=all`; the
  frontend's index builder only accepts plain strings, so adding that
  parameter would silently blank every action name.
