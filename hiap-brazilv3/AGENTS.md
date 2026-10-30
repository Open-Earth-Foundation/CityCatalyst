# agents.md (hiap-brazilv3)

Base rules: follow [`../hiap-meed/AGENTS.md`](../hiap-meed/AGENTS.md) (absolute imports, docstrings, logging, type hints, block comments, no dead code, `pytest`, `uv`).

Differences in this service:

- Layout is `app/api/`, `app/shared/`, `app/methodologies/<name>/<version>/`, `app/regions/<REGION>/`, plus `app/registry.py` (see `hiap-meed/docs/modular-hiap-architecture-rfc.md`). Region code lives in `regions/`, methodology code in `methodologies/`; neither imports the other except through `registry.py`.
- The methodology is a **scaffold**. Do not invent methodology, formulas, weights or data sources. Stubs return fictitious mock data, and `/v1/prioritize` responses must keep `meta.mock: true` and `meta.methodologyStatus: "scaffold"` until a methodology is approved.
- `app/shared/` is intentionally duplicated from the MEED kernel until the RFC phase 2 extraction. Keep it minimal (weight validation, weighted sum, deterministic ranking).
- No LLM, MLflow or report code here.
- Public API fields are camelCase (`methodologyVersion`, `requestId`), like HIAP-MEED.
