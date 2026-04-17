---
name: implementation-plan
overview: Add an optional, grounded post-ranking explanation stage to `hiap-meed` that generates qualitative `why this ranked here` text for returned `topN` actions via a direct LLM call, while keeping the core ranking pipeline deterministic and test-friendly.
todos:
  - id: define-toggle-and-config
    content: Add the request flag and central runtime configuration for optional explanation generation.
    status: completed
  - id: design-grounding-layer
    content: Design the deterministic evidence-to-qualitative adapter that prepares ranked-action evidence for the LLM.
    status: completed
  - id: add-llm-explanation-stage
    content: Insert the optional post-ranking explanation stage into the orchestrator with fail-open behavior.
    status: completed
  - id: cover-with-tests
    content: Add focused unit and integration coverage for toggle behavior, grounding, and provider failure fallback.
    status: completed
  - id: update-docs
    content: Update README and future-work notes to describe the new explanation capability and remaining gaps.
    status: completed
isProject: false
---

# Implementation Plan

## Scope And Assumptions

- Target only the returned `topN` actions for explanation generation in the first version.
- Call the LLM directly from `hiap-meed`, but keep the integration behind a thin provider boundary so tests can stub it cleanly. You can orientate yourself on hiap/prioritizer/utils/add_explanations.py for the implementation. This is PURELY a ROUGH orientation and its not the best implementation. Follow losely and enhance the implementation.
- Default explanation generation to `false` so ranking-only test runs and bulk/debug runs do not incur latency or cost.

## Current State

- The API contract already exposes `explanation` on ranked actions in [hiap-meed/app/modules/prioritizer/models.py](hiap-meed/app/modules/prioritizer/models.py), but it is always `null` today.
- The best insertion point is already present in [hiap-meed/app/modules/prioritizer/orchestrator.py](hiap-meed/app/modules/prioritizer/orchestrator.py): ranking finishes first, per-block evidence is attached, and the public payload is assembled afterward.
- The strongest grounding signals live in the full in-memory evidence attached in the orchestrator from the hard-filter, impact, alignment, and feasibility stages. `logs_temp` is useful only as a reference for understanding available fields during planning; the implementation itself should use the live in-memory evidence already present in the ranking pipeline.
- The current public `evidence_summary` should remain the compact API-facing structured output, but it is too numeric and too compressed to be the primary grounding input for the LLM explanation step.

## Implementation Approach

### 1. Add an explicit explanation toggle and runtime configuration

- Extend [hiap-meed/app/modules/prioritizer/models.py](hiap-meed/app/modules/prioritizer/models.py) with a request flag such as `requestData.createExplanations: bool = false`.
- Add provider/model/timeout configuration in [hiap-meed/.env.example](hiap-meed/.env.example) and centralize resolution in [hiap-meed/app/modules/prioritizer/config.py](hiap-meed/app/modules/prioritizer/config.py) or a dedicated LLM config module.
- Keep the default off for cost control, deterministic tests, and backward-compatible ranking behavior.
- If different LLMs are being used, each should have their own configs with model names etc.

### 2. Build a grounded explanation module after ranking

- Add a dedicated service module such as [hiap-meed/app/modules/prioritizer/services/explanations.py](hiap-meed/app/modules/prioritizer/services/explanations.py) for post-ranking explanation generation.
- Create a prompt file such as [hiap-meed/app/modules/prioritizer/prompts/ranking_explanation.md](hiap-meed/app/modules/prioritizer/prompts/ranking_explanation.md) that instructs the model to explain ranking qualitatively, not restate raw scores. Fill it with useful defaults and examples. The goal is to explain the qualitative reasons why the action is ranked where it is. For example: "This action aligns highly with the request user feedback x,y,z, and reduces the most emissions in the high emission sector a of the city. Additionally it is feasable to implement based on ... and strongly aligned with the cities preferences 1,2,3...".
- Feed the LLM a curated explanation payload per ranked action, including rank context plus the most relevant evidence from impact, alignment, and feasibility.
- Ideally we do not make 1 LLM call per action but rather a single call for all actions. This will be more efficient and cost-effective.

### 3. Curate evidence before it reaches the LLM

- Add a deterministic evidence-to-language adapter that converts raw evidence into stable qualitative inputs before prompting.
- Treat the full per-action in-memory evidence as the source material for explanation generation, then build an intermediate curated payload from it before calling the LLM.
- Do not use `evidence_summary` itself as the main LLM input. Instead, derive both outputs separately from the same post-ranking evidence: keep `evidence_summary` compact for the API response and prepare a richer curated explanation payload for the LLM.
- Prioritize fields already visible in artifacts and useful for human reasoning: impact band, matched high-emission GPC references, implementation timeline bucket, policy signal summaries, sector preference matches, socioeconomic rationales, and non-blocking legal or implementation notes when available.
- Avoid passing long raw floats or noisy low-signal fields directly; instead map them to qualitative buckets and short evidence bullets.
- Keep unsupported areas explicit. For example, `cityStrategicPreferenceOther` is still a stub, so the first version should not invent reasoning from that field.

### 4. Wire the new stage into the orchestrator without changing ranking logic

- Update [hiap-meed/app/modules/prioritizer/orchestrator.py](hiap-meed/app/modules/prioritizer/orchestrator.py) so explanation generation runs only after `final_scoring` and evidence attachment, and only when `createExplanations=true`.
- Populate `RankedActionResult.explanation` from the explanation service while leaving all score computation untouched.
- Fail open: if the LLM times out or errors, keep the ranking response valid and set `explanation` to `null` for affected items.
- Add request-scoped artifact logging for explanation inputs/results in a sanitized form so prompt grounding can be inspected during development.

### 5. Add focused tests around toggle behavior, grounding, and failure handling

- Extend integration coverage in [hiap-meed/tests/integration/test_prioritize_smoke.py](hiap-meed/tests/integration/test_prioritize_smoke.py) and [hiap-meed/tests/integration/test_prioritize_e2e_mock_api_data.py](hiap-meed/tests/integration/test_prioritize_e2e_mock_api_data.py).
- Add unit tests for the explanation payload builder so qualitative evidence selection is deterministic and does not leak raw-score noise.
- Add tests that verify:
- `createExplanations=false` does not invoke the LLM client.
- `createExplanations=true` generates explanations only for returned `topN` items.
- Provider failure degrades gracefully to `explanation=null` without affecting rank order.

### 6. Update docs and operational guidance

- Update [hiap-meed/README.md](hiap-meed/README.md) with the new request flag, environment variables, expected response behavior, and local test strategy.
- Keep [hiap-meed/future-work.md](hiap-meed/future-work.md) aligned by clarifying which explanation gaps remain out of scope for v1, especially `cityStrategicPreferenceOther` matching and richer implementation-note generation.

## Critical Assessment

- A pure LLM step over the current public response would be too brittle. The present `evidence_summary` is mostly numeric and omits some of the best qualitative evidence, so the explanation step should instead read from the fuller post-ranking in-memory evidence and pass a curated intermediate payload to the LLM.
- Direct LLM calls inside the synchronous request path will increase latency and cost. Restricting generation to `topN`, defaulting the flag to off, and failing open are necessary guardrails.
- Explanation quality will depend on evidence completeness. Some of the most compelling user-facing reasons are still future work today, especially free-text preference matching and UI-friendly implementation notes, so v1 should explain only from implemented signals and avoid overstating certainty. For v1, it should state which parts of ranking are not yet considered becuase they are future work or stubbed.
- Runtime dependency support is not ready yet for direct provider calls. [hiap-meed/pyproject.toml](hiap-meed/pyproject.toml) currently has no runtime LLM client dependency, so the implementation will need either a lightweight HTTP client at runtime or an official provider SDK. Ignore this for now and I will manually add openai sdk later. But build around that assumption.

## Expected File Touchpoints

- [hiap-meed/app/modules/prioritizer/models.py](hiap-meed/app/modules/prioritizer/models.py)
- [hiap-meed/app/modules/prioritizer/api.py](hiap-meed/app/modules/prioritizer/api.py)
- [hiap-meed/app/modules/prioritizer/orchestrator.py](hiap-meed/app/modules/prioritizer/orchestrator.py)
- [hiap-meed/app/modules/prioritizer/config.py](hiap-meed/app/modules/prioritizer/config.py)
- [hiap-meed/app/modules/prioritizer/services/explanations.py](hiap-meed/app/modules/prioritizer/services/explanations.py)
- [hiap-meed/app/modules/prioritizer/prompts/ranking_explanation.md](hiap-meed/app/modules/prioritizer/prompts/ranking_explanation.md)
- [hiap-meed/.env.example](hiap-meed/.env.example)
- [hiap-meed/README.md](hiap-meed/README.md)
- [hiap-meed/future-work.md](hiap-meed/future-work.md)
- [hiap-meed/tests/integration/test_prioritize_smoke.py](hiap-meed/tests/integration/test_prioritize_smoke.py)
- [hiap-meed/tests/integration/test_prioritize_e2e_mock_api_data.py](hiap-meed/tests/integration/test_prioritize_e2e_mock_api_data.py)
- [hiap-meed/tests/unit/](hiap-meed/tests/unit/)
