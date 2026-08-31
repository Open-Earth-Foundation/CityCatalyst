# CC-752 Local Load-Test Evidence

Date: 2026-08-21

## Test setup

- Target: local CityCatalyst production build, backed by PostgreSQL 16 in Docker.
- Dataset: synthetic deterministic fixture with 1,000 successful HIAP rankings, 3,000 ranked actions, and 1,000 action plans.
- Payload profile: 32 KiB JSONB `subactions` payload per action plan.
- Load: constant arrival rate of 2 GET requests/second for 60 seconds, executed by `grafana/k6:0.54.0`.
- Baseline: `origin/develop` at `c5d3a091d`.
- Fixed: CC-752 implementation at `4afe89e13`.
- Memory: local Node process working set and private bytes sampled every five seconds.

## Comparison

| Evidence                       |                          Baseline (`origin/develop`) |               Fixed (`4afe89e13`) | Result                                                                   |
| ------------------------------ | ---------------------------------------------------: | --------------------------------: | ------------------------------------------------------------------------ |
| Completed requests             |                                                   12 |                               120 | Fixed sustained the target rate.                                         |
| Dropped iterations             |                                                  101 |                                 0 | Fixed did not exhaust the VU budget.                                     |
| HTTP/request failures          |                                         100% (12/12) |                        0% (0/120) | Fixed stayed within the error budget.                                    |
| 5xx responses                  |                                            0% (0/12) |                        0% (0/120) | No server 5xx in either run; baseline requests timed out.                |
| p95 request latency            |                                          59,995.7 ms |                           11.1 ms | Fixed removed the synchronous backfill cost from the cron path.          |
| Polling-only response contract |                               0% of completed checks |             100% (240/240 checks) | Fixed returned no `catalogBackfilled` or `actionPlansBackfilled` fields. |
| First cold request             | 24,771 ms; backfilled 1,000 rankings and 1,000 plans | 238 ms smoke request; no backfill | Backfill is no longer part of the web request.                           |
| Node working-set peak          |                                         1,040.68 MiB |                        162.25 MiB | Fixed peak was 84.4% lower in this local run.                            |
| Node private-memory peak       |                                         1,058.28 MiB |                        157.21 MiB | Fixed peak was 85.1% lower in this local run.                            |
| Process restarts               |                               Not applicable locally |            Not applicable locally | Kubernetes restart evidence still requires staging.                      |

## Interpretation

The local comparison reproduces the failure mode: the old cron endpoint performs the catalog backfills synchronously, becomes saturated, and grows to approximately 1 GiB of process memory. The fixed endpoint only polls HIAP jobs and remains responsive under the same synthetic load and database profile.

This is controlled local evidence, not production or Kubernetes evidence. The next validation step is the same k6 profile against an approved staging target while collecting pod restarts and `kubectl top` memory samples.
