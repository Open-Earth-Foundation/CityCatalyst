---
name: repo-doc-audit
description: One-off full repository audit for documentation health (docstrings, README, architecture, scripts conventions). Use explicitly when requested.
disable-model-invocation: true
---

# repo-doc-audit

This is a **one-off**, repo-wide documentation audit. It is intentionally **not** automatic because it can be expensive and noisy.

## When to use

- Use this skill when the user asks for a **full repo documentation audit** or “is everything up to date?”
- Use after large refactors, restructurings, or major feature additions.

## Goal

Produce an actionable report (and optionally fixes) across:

- `README.md` accuracy (setup/run/config/troubleshooting)
- `architecture.md` accuracy (diagrams and component naming)
- Script docstrings and runnable-script conventions
- Consistency between dependency docs (`pyproject.toml`, `requirements.txt`, and lockfiles such as `uv.lock` / `poetry.lock`)
- Presence of `.env.example` entries for documented env vars

## Audit method (recommended)

### 1) Establish repo “truth” from code and configs

- Identify real entrypoints (commands in `README.md`, modules with `__main__`, top-level scripts).
- Identify configuration files that control runtime (e.g., model/provider selection, pipeline toggles).
- Identify output folders and naming conventions from code paths.

### 2) Read and validate key docs against truth

- `README.md`
  - Commands exist and match actual flags/paths.
  - Setup instructions match dependency source of truth policy.
  - Output structure matches code behavior.
- `architecture.md`
  - Components referenced exist in the repo.
  - Diagrams reflect current flow and naming.
- Module-level READMEs (if present in modules)
  - Do they describe actual behavior and entrypoints?

### 3) Script/docstring audit (repo-wide)

For any file that looks runnable (heuristics):

- Located under a `scripts/` folder, OR
- Mentioned in docs as an entrypoint, OR
- Contains `if __name__ == "__main__":`, OR
- Imports `argparse` and defines `main()`

Check:

- Top-level module docstring exists and covers:
  - Brief
  - Inputs (each CLI flag should have a short purpose + expected format; env vars should explain what they control)
  - Outputs
  - Usage from project root (`python -m ...`)
- Uses `argparse` for CLI (when runnable).
- Has `__main__` guard.
- Avoids side effects at import time.
- Logging: uses `logging` (not `print`) except intentional CLI UX.
- Imports: prefer **absolute imports**.
- Paths: prefer `pathlib.Path`.

Additionally (repo-wide): check that **every function and method** has a docstring.

- Trivial functions/methods: one-liner docstring is acceptable.
- Non-trivial or side-effecting functions/methods: docstring should explain inputs/outputs, side effects, and raised exceptions when non-obvious.

### 4) Produce an output report

Deliver a report with:

- **Summary**: 3–6 bullets of highest-impact issues
- **Findings** grouped by document/file
- **Fix suggestions**: concrete edits (small, scoped)
- **Optional automated fixes**:
  - Only apply if user asked you to fix; otherwise just report.

## Non-goals

- Do not try to enforce style consistency beyond correctness.
- Do not rewrite large sections unless necessary for accuracy.

