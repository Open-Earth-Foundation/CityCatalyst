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

These are the canonical routes, all under `city/{cityId}/meed/`. Every one
authorises the caller before doing any work.

| Method | Path                                                             | Purpose                                 | Guard                |
| ------ | ---------------------------------------------------------------- | --------------------------------------- | -------------------- |
| GET    | `city/{cityId}/meed/actions`                                     | Action catalog                          | `canAccessCity`      |
| GET    | `city/{cityId}/meed/city-attributes`                             | Socioeconomic context                   | `canAccessCity`      |
| GET    | `city/{cityId}/meed/policy-scores`                               | Policy-alignment scores per action      | `canAccessCity`      |
| GET    | `city/{cityId}/meed/finance/feasibility`                         | Climate-finance feasibility             | `canAccessCity`      |
| GET    | `city/{cityId}/meed/finance/opportunities?sector=&financeRoute=` | Funding opportunities                   | `canAccessCity`      |
| GET    | `city/{cityId}/meed/finance/projects?actionId=`                  | Comparable projects                     | `canAccessCity`      |
| GET    | `city/{cityId}/meed/rank?inventoryId={uuid}`                     | Stored ranking                          | `canAccessInventory` |
| POST   | `city/{cityId}/meed/rank`                                        | Runs the ranking, stores it, returns it | `canAccessInventory` |

The query parameter is **`financeRoute`**, not `route`. `route` also exists — as
a _value_ inside the finance payload ("own-budget feasible") — which is the trap.

**Two response conventions, one service.** The six reference-data routes are pure
pass-throughs, so their payloads are hiap-meed's contract verbatim: snake_case
bodies wrapped with `meta` and `warnings`. The ranking route goes through
CityCatalyst models, so it is camelCase. Do not assume one covers both; the
bridge for the ranking side is `MEED/meedRankingAdapter.ts`.

Cache tags: the reference-data routes share `"Meed"`; the ranking routes use
`"MeedRanking"`, so running a ranking does not invalidate catalog data that a
ranking cannot change.

### Superseded: the `modules/meed/*` proxies

`city/{cityId}/modules/meed/{actions,city-attributes,policy-scores,finance/feasibility}`
still exist and are still what the screens call. They are replaced by the routes
above, but the swap is not a URL change, because the payloads differ: the Global
API returns camelCase (`actionId`, `timelineForImplementation`) while the new
routes return snake_case (`action_id`, `implementation_timeline`).
`buildActionIndex` accepts only the camelCase spelling, so pointed at the new
payload it drops every row and returns an empty index — silently, since it skips
rows without an id. That migration needs an adapter at the boundary, the way the
ranking did.

`modules/meed/finance/follow?link=` is broken as well as superseded: its guard
only permits `/api/v1/cities/` while the real links are
`/api/v1/climate-finance/…`, so both calls 400 and the opportunity and project
cards render "no data" without saying why. It is replaced by `finance/projects`
and `finance/opportunities`, and should be deleted together with
`useGetMeedFinanceLinkQuery`, `followLink` and the guard.

### Shared CityCatalyst endpoints the MEED screens also use

| Path                                       | Used for                       |
| ------------------------------------------ | ------------------------------ |
| `inventory/{inventoryId}`                  | inventory + city, incl. locode |
| `inventory/{inventoryId}/results`          | emissions totals               |
| `inventory/{inventoryId}/results/{sector}` | sector breakdown               |
| `city/{cityId}`                            | city record                    |
| `city/{cityId}/inventory`                  | inventory switcher             |
| `city/{cityId}/population/{year}`          | population                     |
| `/user`                                    | session user                   |

## 2. CityCatalyst → hiap-meed (the MEED service)

Base `HIAP_MEED_API_URL` + `/v1/`, called from `app/src/backend/MeedApiService.ts`.

| Method | Path                                                             | Called by                      |
| ------ | ---------------------------------------------------------------- | ------------------------------ |
| POST   | `/v1/prioritize`                                                 | `POST city/{cityId}/meed/rank` |
| GET    | `/v1/action-pathways`                                            | `meed/actions`                 |
| GET    | `/v1/cities/{locode}/attributes`                                 | `meed/city-attributes`         |
| GET    | `/v1/cities/{locode}/action-policy-scores`                       | `meed/policy-scores`           |
| GET    | `/v1/cities/{locode}/climate-finance/feasibility?country_code=`  | `meed/finance/feasibility`     |
| GET    | `/v1/climate-finance/opportunities?country_code=&sector=&route=` | `meed/finance/opportunities`   |
| GET    | `/v1/climate-finance/projects?country_code=&action_id=`          | `meed/finance/projects`        |

Note the rename across that boundary: the CityCatalyst route takes
`financeRoute`, and `MeedApiService` forwards it to hiap-meed as `route`.

`MeedApiService.runRanking` enriches the ranking request with `locode`,
`countryCode`, `populationSize` and `cityEmissionsData` built from the
CityCatalyst database using `inventoryId` — the frontend must not send those.

Three hiap-meed endpoints are modelled in `app/src/util/types/meed.ts` but
wired to nothing, and have no CityCatalyst route:

- `/v1/prioritize/exclusions/preview` — the reason pre-flight computes
  exclusion proposals locally from the catalog instead of asking the service.
- `/v1/reports/output-plan` — needed before the results screen can generate the
  multi-action report it already collects selections for.
- `/v1/explanations/translate`

## 3. CityCatalyst → Global API

Base `GLOBAL_API_URL`, via `app/src/backend/meed/MeedGlobalApiService.ts`.
Every method swallows errors and returns `null`, so screens render empty states
rather than failing.

| Path                                                  | Feeds                    |
| ----------------------------------------------------- | ------------------------ |
| `/api/v1/action-pathways`                             | action catalog           |
| `/api/v0/city_attributes/{locode}`                    | socioeconomic context    |
| `/api/v1/cities/{locode}/action-policy-scores`        | policy alignment         |
| `/api/v1/cities/{locode}/climate-finance/feasibility` | finance feasibility      |
| `/api/v1/cities/…`                                    | `followLink` passthrough |

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
