# Error Fixed

I count fifteen distinct fixes from this conversation:

1. **Develop CA feature flag**
   - **What was fixed:** Added `CA_FEATURE_FLAGS=STATIONARY_ENERGY_AGENTIC` to the develop Climate Advisor deployment.
   - **Why:** Without this, the CA service would not expose the Stationary Energy agentic draft routes in dev.

2. **Develop web feature flag**
   - **What was fixed:** Added `STATIONARY_ENERGY_AGENTIC` to the develop web deployment `NEXT_PUBLIC_FEATURE_FLAGS`.
   - **Why:** Without this, the frontend would hide or block the Stationary Energy demo flow even if the backend was ready.

3. **CA token endpoint URL**
   - **What was fixed:** Changed CA user-token issuance to call the internal CityCatalyst endpoint through `HOST` instead of request `origin`, and removed the route-level `origin` plumbing.
   - **Why:** Request `origin` could point at the wrong host in dev/proxy environments, causing token issuance to fail and breaking CA integration.

4. **Upstream CA error details**
   - **What was fixed:** Preserved upstream Climate Advisor JSON error payloads when creating proxy HTTP errors.
   - **Why:** Callers need the original status and structured details for debugging and correct UI/API error handling, not only a flattened fallback message.

5. **Deterministic emissions detection**
   - **What was fixed:** Updated Stationary Energy deterministic proposal generation to treat top-level `emissions_value` / `emissions_value_100yr` fields as usable emissions, in addition to nested `gases[]`.
   - **Why:** Some source rows expose emissions at the top level. Those rows were being treated as gaps/no usable emissions even though valid emissions data existed.

6. **UI emissions display**
   - **What was fixed:** Updated Stationary Energy UI utilities to read both top-level emissions fields and nested `gases[]` emissions rows.
   - **Why:** The review UI could miss valid emissions values or display the wrong value when the source data used the top-level shape.

7. **Review/save during async generation**
   - **What was fixed:** Blocked Stationary Energy draft review and save while generation is still running (`resolving_scope`, `loading_context`, or `generating`) in both backend service logic and UI flow helpers.
   - **Why:** Users could try to review or save before all proposals were generated, which risked incomplete decisions and broken save behavior.

8. **Demo synthetic conflict source**
   - **What was fixed:** Updated `SE_DEMO_SYNTHETIC_CONFLICT=true` to clone and scale top-level emissions fields as well as nested `gases[]` fields.
   - **Why:** The demo conflict path depended on synthetic competing emissions. It failed for top-level emissions rows, so the conflict scenario could silently not appear.

9. **Current-dev number format feature**
   - **What was fixed:** Brought over the current-dev user `numberFormat` migration, model field, API response/update typing, shared formatter helpers, settings/profile UI, and affected reporting/manual-input formatting call sites.
   - **Why:** Without this, the branch would miss the current dev user number-format preference and would regress displayed values across reports, dashboards, drawers, and input flows.

10. **Climate Advisor OpenRouter smoke check**
    - **What was fixed:** Brought over the develop workflow OpenRouter API key validation step, the matching smoke test, and the current health route shape.
    - **Why:** Dev deploys need to catch a missing or rejected `OPENROUTER_API_KEY` before deployment proceeds.

11. **SourceDrawer connected-source behavior**
    - **What was fixed:** Brought over current-dev `SourceDrawer` handling for `numberFormat` and `isConnected`, including the go-to-source action for already connected sources.
    - **Why:** Already connected sources should not keep showing the connect action, and emissions displayed in the drawer should respect the user's number-format preference.

12. **ProjectModules Sequelize field declaration**
    - **What was fixed:** Updated `ProjectModules.expiresOn` to use a declared model field.
    - **Why:** This avoids emitting an unintended runtime class field and matches the current-dev Sequelize model fix.

13. **Stationary Energy tonnes formatting compatibility**
   - **What was fixed:** Changed the Stationary Energy utility call from `convertKgToTonnes(kgValue, null)` to `convertKgToTonnes(kgValue, undefined)`.
   - **Why:** The current-dev formatter signature uses the second argument for `numberFormat`; passing `null` is not the intended no-format value.

14. **Stationary Energy documentation alignment**
   - **What was fixed:** Aligned the Stationary Energy docs and inline contracts with the current implementation:
     - `build_deterministic_proposals` now documents and types its actual three-value return.
     - `app/scripts/seed-brazil.ts` and `CHANGES-stationary-energy-demo.md` now show the real command: run from `app/` with `npx tsx scripts/seed-brazil.ts`.
     - `CHANGES-vs-ON-5782.md` now reflects the committed branch footprint and no longer describes the latest UI pass as still only in the working tree.
     - The demo conflict docs now state that `SE_DEMO_SYNTHETIC_CONFLICT` is local-testing only, off by default, and must stay unset/false outside local demos.
   - **Why:** The docs had drifted from the actual return contract, script entrypoint, committed branch state, and local-only behavior of the demo conflict toggle.

15. **Synthetic demo source saveability**
   - **What was fixed:** Updated review storage so selecting the synthetic demo alternative persists the committable real datasource id from `details_datasource_id` instead of the fake `*-demo-alt` display id.
   - **Why:** The UI could select the synthetic candidate, but save later sent the fake datasource id as `selected_source_id`. CityCatalyst validates commit rows as UUID datasource ids, so the synthetic selection could fail save even though review succeeded.

Test and coverage updates included:

- Updated Stationary Energy draft tests for async start/retry responses and deterministic proposal generation.
- Added coverage for the in-progress review/save guard.
- Added coverage for synthetic conflict cloning with top-level emissions fields.
- Added coverage for selecting the synthetic demo alternative and saving with the real datasource id.
- Updated route tests to use the new `HOST`-based CA token endpoint.
- Brought over current-dev OpenRouter smoke-test coverage.

Validated with:

- `uv run --directory service pytest tests/test_stationary_energy_drafts.py tests/test_stationary_energy_llm_prompt.py -q`
- `npm run jest:windows -- tests/stationary-energy-draft-flow.jest.ts tests/api/stationary-energy-draft-routes.jest.ts tests/api/chat-routes.jest.ts --coverage=false`
- `npx tsc --noEmit --pretty false`
- `git diff --check`
- `uv run --directory service pytest tests/test_stationary_energy_drafts.py tests/test_stationary_energy_llm_prompt.py tests/test_openrouter_key_smoke.py -q`
- `uv run pytest service/tests/test_stationary_energy_drafts.py -q`

Known validation issue not fixed in this pass:

- `npm run jest:windows -- tests/api/user.jest.ts ...` fails before running assertions because `tests/helpers.ts` is transformed outside the expected ESM context and throws `Cannot use 'import.meta' outside a module`.
- This appears to be a Jest/ESM harness issue in the existing test setup, not a failure from the user number-format changes. The Stationary Energy/chat Jest suites, TypeScript check, Climate Advisor pytest suite, and `git diff --check` all passed.

Known translation issue not fixed in this pass:

- The web translation workflow maps `secrets.TRANSLATION_OPENAI_API_KEY` into `OPENAI_API_KEY` for `app/scripts/update-translation.js`.
- The workflow run after the Stationary Energy English i18n keys were merged hit `AuthenticationError: 401 You do not have access to the organization tied to the API key` / `invalid_organization` while processing `stationary-energy-agentic.json`.
- Because of that secret/org-access problem, `de`, `es`, `fr`, and `pt` `stationary-energy-agentic.json` files stayed as `{}` even though the workflow reported success.
- This is separate from `NOTION_API_KEY`; Notion is only used for token usage logging and is not the translation failure.
