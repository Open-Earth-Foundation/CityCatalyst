---
name: docs-after-change
description: Mandatory after any code change. Ensures docstrings, README, and architecture/docs stay consistent with the new behavior.
---

# docs-after-change

This skill is **mandatory** after any code change (including refactors). It is optimized to keep repository documentation accurate without doing unnecessary full-repo audits.

## When to use

- Use this skill **after you make any code changes** (add/edit/delete/rename).
- Use this skill **before** finishing the task / handing control back to the user.

## Goal

Keep documentation and developer UX up-to-date by validating and updating:

- **Docstrings** in changed runnable scripts (and other touched modules where docstrings are used as primary docs)
- **README(s)** that document entrypoints, setup, env vars, and outputs
- **Architecture docs** (e.g., `architecture.md`) when flow/structure changes

## Inputs (what you should consider as “code change”)

- Python files (`.py`)
- Configuration files (`.yml`/`.yaml`, `.toml`, `.json`, `.env.example`) that affect runtime behavior (models, providers, pipelines)
- Docker/Kubernetes/deployment manifests
- Migrations / schema changes / database models
- Anything that changes CLI flags, environment variables, output folders, or the pipeline stages

## Instructions (do these steps in order)

### 1) Identify what changed and what it impacts

- Determine the **scope** of changes:
  - **CLI/entrypoints** (e.g., `app/main.py`, `app/scripts/*`, `python -m ...`)
  - **Configuration** (e.g., `pyproject.toml`, `*.yml`, `.env.example`, provider/model selection)
  - **Outputs** (folders, file formats, naming conventions)
  - **Architecture** (module boundaries, new stages, new services, data flow)
  - **Tests** (new workflows, changed assumptions)

### 2) Docstrings: update runnable scripts and public entrypoints

For any file intended to be executed as a script or documented as an entrypoint:

- Ensure a **top-level module docstring** exists and is accurate:
  - Brief one-liner of what it does
  - Inputs (files, env vars, CLI args) with enough detail to be self-explanatory (each CLI flag should have a short purpose + expected format)
  - Outputs (files, stdout, DB writes)
  - Usage example **from project root** using `python -m ...`
- Ensure side effects do not run at import time (work in `main()`).
- Ensure CLI args in docstring match actual `argparse` behavior.

If the file is not runnable but is a “public” module (commonly imported or referenced in docs), ensure key functions/classes have docstrings where they clarify non-obvious behavior or invariants.

Additionally (general rule): ensure **every function and method** you touched has a docstring.

- Trivial functions/methods: a one-liner is enough.
- Non-trivial or side-effecting functions/methods: describe inputs/outputs, side effects, and raised exceptions when non-obvious.

### 3) README updates: keep developer instructions truthful

Update `README.md` if any of these changed:

- Installation steps (`pip`, `uv`, `requirements.txt` vs `pyproject.toml`)
- Required environment variables / keys
- Example commands (`python -m ...`) and their flags
- Output directories / filenames / structure
- Typical workflows (single input vs batch, optional stages/flags, performance/quality tradeoffs)
- Model/provider configuration examples

Checklist:

- Keep examples runnable (command names, paths, flags).
- Avoid adding secrets; only document them in `.env.example`.
- If you introduce a new required env var, ensure it appears in `.env.example` and is referenced in `README.md`.

### 4) Architecture docs: update when structure/flow changes

Update `architecture.md` (and any other architecture documents) if you changed:

- Module responsibilities and boundaries
- Data flow between stages
- Components/services that exist or no longer exist
- Persistence/storage strategy (DB schemas, linking/mapping strategy if applicable, output formats)

Rules of thumb:

- If diagrams mention classes/modules that don’t exist anymore, fix the diagram.
- If a new stage is added, document it and show where it reads/writes.

### 5) Consistency pass

- Ensure terminology matches across docs (stage names, folder names, pipeline steps).
- Ensure paths are consistent (relative to project root).
- Ensure references to “source of truth” are consistent (e.g., dependency management policy).

### 6) Report what you changed

In the final response, include:

- Which docs you reviewed
- Which docs you changed and why (1–3 bullets)
- Any docs you intentionally did **not** change (and why)

## Non-goals (what NOT to do)

- Do **not** run a full-repo audit here (use `/repo-doc-audit` for that).
- Do **not** rewrite docs for style; focus on correctness and minimal updates.

