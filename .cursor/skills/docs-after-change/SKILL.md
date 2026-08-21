---
name: docs-after-change
description: Inspect documentation impact after modifying code, configuration, deployment files, migrations, or runtime behavior. Update only the docstrings, READMEs, architecture docs, and developer instructions whose documented contract actually changed.
---

# docs-after-change

Run this inspection before finishing any task that changes code or runtime configuration. The inspection is mandatory; documentation edits are not. A valid outcome is that the affected documentation remains accurate and no edit is needed.

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

## Instructions

### 1) Identify what changed and what it impacts

- Determine the **scope** of changes:
  - **CLI/entrypoints** (e.g., `app/main.py`, `app/scripts/*`, `python -m ...`)
  - **Configuration** (e.g., `pyproject.toml`, `*.yml`, `.env.example`, provider/model selection)
  - **Outputs** (folders, file formats, naming conventions)
  - **Architecture** (module boundaries, new stages, new services, data flow)
  - **Tests** (new workflows, changed assumptions)

- Decide whether the change affects a documented contract:
  - public behavior or user-visible workflows
  - setup, configuration, environment variables, or deployment
  - CLI commands, flags, entrypoints, inputs, outputs, or file locations
  - module responsibilities, service boundaries, persistence, or data flow
  - developer procedures needed to run, test, debug, or operate the system

If none of these changed, do not edit documentation merely because code was touched. Record that the relevant docs were checked and remain accurate, then stop the documentation pass.

### 2) Docstrings: update runnable scripts and public entrypoints

For any file intended to be executed as a script or documented as an entrypoint:

- Ensure a **top-level module docstring** exists and is accurate:
  - Brief one-liner of what it does
  - Inputs (files, env vars, CLI args) with enough detail to be self-explanatory (each CLI flag should have a short purpose + expected format)
  - Outputs (files, stdout, DB writes)
  - Usage example **from project root** using `python -m ...`
- Ensure side effects do not run at import time (work in `main()`).
- Ensure CLI args in docstring match actual `argparse` behavior.

If the file is not runnable but is a “public” module (commonly imported or referenced in docs), update key function or class docstrings only when the change affects a non-obvious contract, invariant, side effect, input, output, or raised exception.

Do not add or rewrite docstrings for trivial private helpers solely because they were touched.

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
- If no docs changed, state that the documentation impact check passed and briefly explain why no update was required

## Non-goals (what NOT to do)

- Do **not** run a full-repo audit here (use `/repo-doc-audit` for that).
- Do **not** rewrite docs for style; focus on correctness and minimal updates.

