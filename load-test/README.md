# Setup

- [https://grafana.com/docs/k6/latest/set-up/install-k6/](Setup k6)

# Running

```bash
cd load-test
npm run load
```

_OR_ (for manual parameter selection)

```bash
k6 run --vus 30 --duration 10s city_catalyst.ts
```

## HIAP cron regression load test

`hiap_cron.js` exercises the internal `GET /api/v1/cron/check-hiap-jobs`
endpoint at a constant arrival rate. It verifies the polling-only response
contract and records latency, HTTP errors, 5xx responses, and unexpected
backfill fields.

Run it only against a disposable local or approved staging/prod-like target.
The endpoint can advance HIAP work, so prepare the target dataset first and do
not point this test at production without an explicit change approval.

```powershell
$env:BASE_URL = "https://citycatalyst-test.openearth.dev"
$env:CRON_API_KEY = "<internal-cron-key>"
$env:RUN_ID = "cc-752-fixed-2026-08-21"
k6 run --summary-export .\results\cc-752-fixed-summary.json .\hiap_cron.js
```

Defaults are five minutes at one request per second, with a maximum of 20
virtual users. Override `RATE`, `DURATION`, `PRE_ALLOCATED_VUS`, or `MAX_VUS`
only when the target's capacity and test objective justify it.

The expected fixed-build evidence is:

- `http_req_failed < 1%` and `hiap_cron_5xx == 0`;
- p95 request and route duration below 2 seconds;
- zero unexpected backfill fields in the response;
- no increase in Web pod restarts during the run;
- stable pod memory, collected alongside k6 with
  `collect-hiap-cron-evidence.ps1` when Kubernetes metrics are available.

Use `cc-752-evidence-table.template.md` to turn the run artifacts into a
card-ready comparison without claiming incident data was a controlled
baseline.
