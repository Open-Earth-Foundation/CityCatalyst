---
name: script-quality-gate
description: Apply when adding or modifying runnable scripts/entrypoints. Ensures docstring, argparse, __main__, logging, and import/path conventions are correct.
---

# script-quality-gate

Use this skill when creating or changing a runnable script / CLI entrypoint.

## When to use

- New script added anywhere in the repo
- Changes to an existing runnable script or CLI flags
- Any time documentation references a new/changed entrypoint

## Goal

Ensure runnable scripts are predictable, documented, and consistent across the repository.

## Checklist (must pass)

### Location & packaging

- Put runnable scripts in the **intended scripts location** for this repository.
  - If the repo has an established pattern (e.g. a root entrypoint like `run_app.py` / `cli.py`), follow it.
  - Do not introduce a new script folder pattern unless necessary; prefer consistency.
- Ensure any code directory is a Python package (has `__init__.py`) when it must be importable as a module.

### Docstring (top-level, required)

Add/maintain a top-level module docstring matching this template:

```python
"""
Brief: <one-liner description>

Inputs:
- CLI args: list each `--flag` with a short “what it does” plus expected format (and defaults when non-obvious).
  - Example: `--input-dir`: Directory containing JSON outputs from the previous pipeline step.
  - Example: `--dry-run`: Validate only; skip writes.
- Files/paths: describe expected structure (file types, patterns, required subfolders).
- Env vars: list required environment variables and what they control (never include secret values).

Outputs:
- <files, stdout, DB writes, API responses, etc.>

Usage (from project root):
- python -m <module.path> --arg1 ...
"""
```

### CLI conventions

- Use `argparse`.
- Provide `--help` descriptions that match README examples.
- Do work inside `main()`; avoid side effects at import time.
- Include:
  - `def parse_args() -> argparse.Namespace:`
  - `def main() -> None:`
  - `if __name__ == "__main__": ...`

### Logging

- Use `logging` (not `print`), except intentional CLI UX cases.
- Ensure logger setup follows the repository logging conventions (do not duplicate logger setup code).

### Imports & paths

- Prefer **absolute imports**.
- Prefer `pathlib.Path` for filesystem paths.

## After the checklist

- Run the `docs-after-change` skill to ensure README/architecture references stay correct.

