# Agentic E2E tests

Browser tests written with [e2e](https://e2e.tester.army/docs). An AI agent
(`agent.act`) drives the UI steps that broke the Playwright suite most often
(onboarding wizards, the activity modal, the download modal and the funding
dialog). Every agent step is followed by a deterministic check (`expect`), the
API or a typed extraction (`agent.extract`).

| Test                          | Replaces                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `dashboard-onboarding.e2e.ts` | `e2e/dashboard.spec.ts`                                                            |
| `report-results.e2e.ts`       | the scope 1, scope 2 and the skipped results tests in `e2e/report-results.spec.ts` |
| `csv-download.e2e.ts`         | the UI download in `e2e/csv-download.spec.ts`                                      |
| `concept-note-funding.e2e.ts` | `e2e/concept-note-funding.spec.ts`                                                 |

## Run

```bash
npm run build                      # the runner starts `next start`, like Playwright
DEFAULT_ADMIN_EMAIL=e2e-test-admin@citycatalyst.local \
DEFAULT_ADMIN_PASSWORD='E2ETestAdmin123!' npm run create-admin
npm run e2e:agent                  # all tests
npx e2e run e2e-agent/csv-download.e2e.ts --headed
```

- Agent steps call OpenAI `gpt-6-luna` (`E2E_MODEL` overrides it). The config
  reads `OPENAI_API_KEY` from the environment, else from `.env.local`/`.env`.
- `E2E_APP_URL` points at another port when 3000 is taken; with
  `reuseExisting` an already running server on that URL is used as is.
- Concept note tests need `CONCEPT_NOTE_BUILDER` and `CA_SERVICE_INTEGRATION`
  in `NEXT_PUBLIC_FEATURE_FLAGS`.
- Passing agent steps are recorded in `.e2e/cache/` and replayed without model
  calls on the next run. `--no-cache` runs every step live.
- Opt out of the runner's anonymous telemetry with `E2E_TELEMETRY_DISABLED=1`.

## Conventions

- Each test creates its own city with a unique locode
  (`CityCatalystApi.createChicagoInventory`): `POST /city` returns the user's
  existing city for a known locode, so a shared locode shares one inventory
  between tests.
- Sign-in sets the NextAuth session cookie instead of typing the password, so
  screenshots stay available to the agent.
- Give each `agent.act` one goal and say where to stop ("do not save") when the
  next deterministic check needs the intermediate state.
