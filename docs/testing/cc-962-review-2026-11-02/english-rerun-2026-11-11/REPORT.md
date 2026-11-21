# English Clima live rerun — 2026-11-11

Result: Partial coverage; six recorded conversations through the live dev UI. No inventory changes made. Independent provider traces were not captured.

Environment: https://citycatalyst.openearth.dev, UI v1.28.0-dev.0, authenticated existing account, Chromium 1440 × 1000. Shared preview unavailable; standalone Playwright used. Authentication happened outside recordings. Six recorded conversations with nine English messages and nine captured responses. Browser-context isolation and streaming completion were not independently verified. See run-1.json through run-6.json for exact prompts, full visible answers, UTC timestamps and inventory URL. Model and trace IDs were not surfaced or captured. These are live deployed results, not proof that the PR branch is deployed.

## Scenarios and outcomes

- PDF route, runs 1–3: expected an actionable route supported by the UI and honest file-receipt status. All three advised an inventory “Data Sources” area with “Add data source / Upload file” or “Upload document”. The actual GHGI page exposes sector Add Data buttons. Opening Stationary energy Add Data led to sector/subsector selection and Search for available datasets, without those named upload controls on that screen. Route guidance is unverified and misleading at the tested entry points; deeper subsector upload capabilities remain untested. Only a 2022 inventory was visible; no 2023 inventory was created.
- PDF receipt, runs 1–3: all three correctly denied receiving a PDF. No attachment was supplied. Runs 1–2 still refer generically to files uploaded through chat; run 3 explicitly directs upload through Data Sources rather than this chat. An attachment control was not present among the inspected chat controls. Receipt honesty passed; broader upload-capability wording needs clarification.
- Inventory provenance, runs 4–6: asked “What inventory year, geography, total emissions value and units are available for this city? Name the source for each fact and explain any limitations.” All three requested a city/year instead of identifying the current inventory. They did not fabricate a numerical total. Expected useful page-context grounding or a clear access limitation; observed clarification rather than an inventory-grounded answer. No numerical accuracy pass can be awarded.

## Available comparison evidence

The live page displayed Porto Alegre, 2022, 915.9 ktCO₂e, 496 km² and GPC BASIC; inventory completeness 9% (6% connected third-party data, 3% uploaded data). This is an authoritative comparison for what the application displays, not independent validation of the underlying emissions calculation. The exact page text is retained with every answer. No invented golden expected dataset was used. Clima supplied no numerical claim to compare or underlying source citation to verify.

## Recording evidence

Runs 1–3 last 94.76, 96.24 and 95.40 seconds; runs 4–6 last 48.92, 48.80 and 48.76 seconds. All six have nonzero sizes verified with ffprobe. First answers were captured about 00:48 and PDF follow-ups about 01:33; exact UTC capture times are in JSON. A representative run-1 frame was visually inspected: intended GHGI city page and readable Clima answer. Answers are preserved in text because the chat scroll area cannot show the entire conversation simultaneously. Fixed 45-second waits were used after each send; captured text showed completed prose, but no streaming lifecycle telemetry was collected. No app mocks, translations, or response replacement.

## Limitations and assessment

Six recorded conversations contain nine captured responses, with no product crash captured. Additional explicitly named-city runs could not begin after three bounded login timeouts; these do not invalidate the six authenticated recordings. Initial exploration also encountered case-sensitive locator failures corrected using observed accessible controls. No conclusion about authentication root cause is made.

Cancel/typed-consent mutation flow is untested: no disposable inventory fixture was established and real inventory writes were excluded. Partial/retry/access-denial branches and deeper source upload workflows remain untested because this rerun sampled read-only English conversations. No cancellation, consent or mutation-safety pass is claimed. This evidence supports review of response honesty and route/context gaps; it does not establish comprehensive PR readiness.

## Independent review and lead assessment

A separate GPT-6.1 Sol reviewed commit `2808b8e885f53abae3d7d8b24cd3235a755bee15`, all six JSON transcripts, all six video durations and a run-4 video frame. It found no material contradiction in the outcomes, and requested the receipt-wording and verification-scope corrections incorporated above. It also confirmed 149 rendered video players in the PR; it did not independently compare every original attachment identity. This was an evidence review, not another execution of the scenarios.

Lead assessment: the English sample shows that the observed upload-guidance and page-grounding gaps are not confined to Polish interactions. It does not establish their relative frequency across languages. Correctly denying receipt of an absent PDF is a useful narrow success; it does not validate the proposed upload route. Asking again for city/year avoids inventing numbers but fails to use the visible page context effectively. The evidence does not show which context reached the model, so the cause remains unresolved.

Follow-up should verify the actual supported upload route and inspect the context delivered to Clima before choosing a fix. Keep this English sample separate from the historical zero-tolerance summary, and retain the untested consent/write branches as open coverage. These conversations do not verify deployment of the provenance fix or establish release readiness.

## Videos

Run 1: https://github.com/user-attachments/assets/6781b508-a16f-41df-b041-7713b1d75f28

Run 2: https://github.com/user-attachments/assets/4ba2818b-1dfa-4f5c-a68c-89ad22d9d99e

Run 3: https://github.com/user-attachments/assets/957176f2-472b-408c-8df4-2f7b6c98a7a3

Run 4: https://github.com/user-attachments/assets/b3134170-bb5a-46e0-a332-86c3f8d52e09

Run 5: https://github.com/user-attachments/assets/f994116f-cb5d-46bd-ad64-4d8512a6f9ef

Run 6: https://github.com/user-attachments/assets/19a14717-c117-43b5-bd04-f02b33c72083

