# Working context for the MEED module

**Temporary working document.** Delete before #2956 merges, along with
`MeedFrontendIntegrationHandoff.md`.

Cold-start orientation: where the code is, how to run it, and the environment
traps that have already cost time.

## Where the code is

The module branch is checked out in a **dedicated git worktree** at
`~/meed-local`, not in the main clone at `~/Documents/OEF/CityCatalyst`.

That is deliberate. The two share a `.git`, and a branch can only be checked out
in one worktree, so switching branches in the main clone used to invalidate the
running server's build and break the local environment repeatedly. Work on the
module in `~/meed-local`; leave the main clone for docs branches and PR work.

It sits outside `~/Documents` on purpose too — macOS TCC blocks launchd agents
from reading `~/Documents` without Full Disk Access, and the environment is
launchd-managed.

## Running it

```bash
~/meed-local/meed-env.sh          # status
~/meed-local/meed-env.sh start    # start (builds if needed)
~/meed-local/meed-env.sh rebuild  # after pulling or changing source
~/meed-local/meed-env.sh logs
```

`http://localhost:3001` · `johndoe@example.com` / `password`

A launchd agent owns the process, starts it at login and restarts it if it dies.
It serves a **production build**, deliberately — Turbopack's dev cache corrupted
twice (`EPERM` on its `.sst` files) and rendered blank pages. So **run `rebuild`
after changing source**; `npm run dev` is not what is running.

São Paulo is the demo city:
`/en/cities/ce9d91fb-2dd8-4aef-958e-4dd4b98b47c8/MEED`

## Environment traps, all previously hit

- **Builds die silently under memory pressure.** No error, no output, no
  `BUILD_ID`. The fix is to stop the server first — `meed-env.sh rebuild` does
  that. If a build produces empty output, it was killed, not broken.
- **`preview_start` cannot launch the dev server.** The sandboxed shell cannot
  read its own working directory and npm dies on `getcwd`. Start via
  `meed-env.sh`, then point the browser tool at the URL.
- **`meed-env.sh` is untracked on purpose** (machine-specific paths, in
  `.git/info/exclude`). Do not commit it.

## Data situation

- **São Paulo's inventory is partly synthetic.** Real seed data had one sector;
  15 rows were added across the other four to give a realistic 5-sector profile
  (3.9 Mt, transport-dominant). They are tagged `input_methodology =
  'mock-demo-seed'` and removable with one DELETE. AFOLU deliberately includes a
  **negative** `V.2` value so the GPC transform's sign handling is exercised.
- **Socioeconomic context is empty for São Paulo** — the Global API returns 404
  for `BR SAO` city attributes entirely. Not a bug.
- **Rankings are mock** behind `MEED_MOCK_RANKING`, tagged "Sample data" in the
  UI. Catalog, policy scores and finance feasibility are **live** Global API data
  in both local and dev — deploying does not change those.
- The module row is created by a **migration** (`20260812150000-register-meed-module`),
  not a seeder, because deployments run `db:migrate` only. Visibility is
  controlled solely by the admin panel; there is no feature flag.

## PR state

| PR | What | State |
|---|---|---|
| [#2956](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2956) | The module | **Draft**, mergeable, awaiting review |
| [#3023](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3023) | Milan's ranking route | Open, mergeable |
| [#2989](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/2989) | Contract docs | Open, mergeable |
| [#3005](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3005) | `HIAP_MEED_API_URL` | **Merged** |

## Conventions this module follows

- **`useMeedRanking` is the single read point** for "does a ranking exist".
  Four screens consume it. Change it in one place, not per screen.
- **`MeedShell` owns wizard chrome** — header, stepper, footer, and step
  confirmation on forward navigation. Screens supply content only, and must not
  add their own forward button.
- **`scoringWeights.ts` is the only source of scoring weights.** They were
  duplicated in four places and drifted into claiming the six steps shaped 168%
  of the ranking.
- **Sector comes from `emissions.sector_number`**, never a top-level `sector`
  field — that field does not exist on any of the 102 catalog actions, and
  reading it made every action render as "Cross-sector".
- Gates explain themselves next to the button they disable, never in a tooltip.
- Only `en` locale files exist for MEED. `fallbackLng` is `en`, so other
  languages show English rather than raw keys.

## Recent work worth knowing about

The last iteration was a prototype-vs-port fidelity audit. It restored four
behaviours the port had dropped (Regulations rendering at all, step completion,
CSV export, co-benefits/trade-offs) and fixed four defects the port introduced
(the 168% badges, an empty-state flash on results, a redirect that treated a
network error as "no inventories", and mock rankings that were indistinguishable
from real ones).

Full detail: `MeedModuleImplementation.md` (what exists) and
`MeedIntegrationStatus.md` (what is owed by whom).
