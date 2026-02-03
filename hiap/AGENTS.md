# agents.md

## Purpose

This repository contains a single AI project. All contributions must optimize for:

- **Readability**: clear docs, clean structure, no dead or unused code, and a logical separation of concerns.
- **Maintainability**: reusable utilities, configuration-driven behavior, proper logging, minimal duplication.
- **Consistency**: a similar feel across modules and scripts via shared patterns, formatting, and conventions.

---

## Cursor Agent Skills (project-level)

This repo includes **project-level Cursor skills** under `.cursor/skills/` (version-controlled). These skills are available to anyone who checks out the repository and opens it in Cursor. See [Cursor Skills docs](https://cursor.com/docs/context/skills).

### Mandatory after code changes

After **any code change** (add/edit/delete/rename), you must apply the `docs-after-change` skill before ending your turn.

Skills included:

- `docs-after-change`: **Mandatory** after any code change. Keeps docstrings/README/architecture accurate.
- `script-quality-gate`: Use when adding/changing a runnable script or CLI entrypoint.
- `repo-doc-audit`: One-off full repo documentation audit (**manual** via `/repo-doc-audit`).

---

## Documentation requirements

### README.md must be up to date

Every repo must have a `README.md` with:

- A short description of the project
- Install instructions using `pip` or `uv`
- Run instructions (local and Docker), including required environment variables, for example: `docker run ... --env-file ...`
- Common workflows, for example running `pytest`

### Runnable scripts must have a top-level docstring

Every script intended to be executed must include a **top-level docstring** describing:

- What the script does (brief)
- Inputs (files, env vars, CLI args) with **enough detail to be self-explanatory**
- Outputs (files, stdout, DB writes, API responses)
- Usage examples (run as a module)

**Docstring template:**

```python
"""
Brief: <one-liner description>

Inputs:
- CLI args: list each `--flag` with a short description of what it does and the expected format.
  - Example: `--input-dir`: Directory containing JSON files produced by the previous step.
  - Example: `--mode`: `validate` (no writes) or `apply` (writes enabled).
- Files/paths: describe expected structure/patterns (e.g. “directory of JSON lists”).
- Env vars: list required env vars and what they control (do not include secrets).

Outputs:
- <files, stdout, DB writes, API responses, etc.>

Usage (from project root):
- python -m app.scripts.<script_name> --arg1 ...
"""
```

---

## Code organization

### Separation of concerns is mandatory

- API calls go into a dedicated module, for example `services/`.
- Helpers go into `utils/` (global) or `modules/<module>/utils/` (module-local).
- Standalone runnable scripts go into `scripts/` (global) or `modules/<module>/scripts/` (module-local).
- Prompts go into `prompts/` (global) or `modules/<module>/prompts/` (module-local).
- Data structures (for example Pydantic models) should be centralized in `models.py` (global and or module-level `models.py`).

### Folder placement must follow the hierarchy

All directories containing code must include an `__init__.py` file to ensure proper package resolution.

Use this structure:

```text
project_root/
│
├── app/                          # Main application code
│   ├── __init__.py
│   ├── main.py                   # Entry point for the app
│   ├── run.sh                    # Optional startup script
│   ├── utils/                    # Utility modules (global)
│   │   ├── __init__.py
│   │   └── logging_config.py
│   ├── services/                 # API calls, DB connections, external integrations
│   ├── scripts/                  # Standalone scripts (global)
│   ├── prompts/                  # LLM prompts (global) as markdown files
│   ├── models.py                 # Global Pydantic models
│   │
│   └── modules/                  # Core modules and features
│       ├── __init__.py
│       └── <module_name>/        # e.g. plan_creator, prioritizer
│           ├── __init__.py
│           ├── utils/            # Module-specific utilities
│           ├── services/         # Module-specific integrations (if needed)
│           ├── scripts/          # Module-specific scripts
│           ├── prompts/          # Module prompts
│           ├── module.py         # Module logic (or api.py, etc.)
│           └── models.py         # Module-level Pydantic models
│
├── tests/                        # pytest test suite
├── k8s/                          # Kubernetes deployment files
│   └── deployment.yaml
├── .github/                      # CI/CD
│   └── workflows/
│
├── .gitignore
├── .dockerignore
├── Dockerfile
├── pyproject.toml                # Dependency source of truth
├── README.md
├── LICENSE.md
├── .env.example                  # documents required env vars (no real secrets)
```

Notes:

- Do not commit `.env`. Use `.env.example` to document required variables.
- If you need non-code assets (sample prompts, fixtures, tiny sample data), put them in a clearly named folder, for example `assets/` or `tests/fixtures/`.

Adaptation note (project-specific naming):

- The folder name `app/` in the hierarchy above is a **placeholder** for the project’s main application package/folder.
- A given repository may deviate (e.g., the “app” code may live in multiple top-level packages, or the folder may be named differently). In that case, follow the **existing** repository layout and map the same concepts:
  - “app-level code” = the primary top-level package(s) containing application logic
  - “modules” = subpackages/features within that package (or equivalent top-level packages if the repo is split)

---

## Standalone scripts rules

Any script that can be executed standalone must:

1. Live under `app/scripts/` or `app/modules/<module>/scripts/`
2. Have a top-level docstring (see template above)
3. Use `argparse` for inputs
4. Include a `__main__` entry point
5. Avoid side effects at import time (do work inside `main()`)

**Minimum required pattern:**

```python
import argparse
import logging

from app.utils.logging_config import setup_logger

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse CLI args."""
    parser = argparse.ArgumentParser(description="Describe what this script does.")
    parser.add_argument("--example", required=True, help="Example argument.")
    return parser.parse_args()


def main() -> None:
    """Script entry point."""
    args = parse_args()
    logger.info("Starting script with args=%s", vars(args))
    # ... script logic ...


if __name__ == "__main__":
    setup_logger()
    main()
```

---

## Maintainability rules

### Prefer reuse over duplication

- If logic is reusable, it belongs in `app/utils/` (global) or `app/modules/<module>/utils/` (local).
- Do not copy or paste functions across scripts.
- Import shared helpers instead.

### Docstrings are required (functions and methods)

- Every Python **function and method** must have a docstring.
  - **Trivial** functions/methods: a minimal **one-liner** is enough.
  - **Non-trivial** or side-effecting functions/methods: docstring must describe:
    - inputs/parameters (expected types/shape and any constraints)
    - return value (and what it represents)
    - side effects (filesystem/DB/network, mutations, logging, caching)
    - raised exceptions (when non-obvious)

### Logging is required

- Use Python’s `logging` module, do not use `print`, except in rare CLI UX cases where it is explicitly intended.
- Use `app/utils/logging_config.py` to configure logging.
- `logging_config.py` usually contains the following code:

```python
import logging
import os


def setup_logger() -> None:
    env_level = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = getattr(logging, env_level, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(filename)s:%(lineno)d - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )


__all__ = ["setup_logger"]
```

- Log key steps and important parameters, do not log secrets.
- Log exceptions with stack traces where helpful.

### Remove dead code

- No unused functions, no commented-out blocks, no maybe later code.
- If it is not used and not needed now, delete it.

### Type hints

- All function signatures must have Python type hints.
- Prefer returning concrete types, avoid `Any` unless you have a good reason.

### Path handling

- Use `pathlib.Path` instead of `os.path` or string manipulation.

### Prefer simple functions over heavy class hierarchies

- Prefer functional code and small, testable functions.
- Use classes only when they clearly reduce complexity (for example a small client wrapper), keep them thin.

### Module imports

- Strictly use **absolute imports**, for example `from app.utils.foo import bar`. Do not use relative imports.
- Always run scripts as modules using `python -m ...` from the project root.

### Prefer clarity over cleverness

- Prefer clear, explicit code over overly compact code.
- Avoid dense one-liners, deeply nested comprehensions, and overly abstract helper chains when they reduce readability.
- Optimize for the next person reading the code, not for brevity.

---

## Configuration and secrets

- Secrets go only in the runtime environment. For local dev, that typically means a `.env` file that is not committed.
- Provide a `.env.example` that documents required env vars without real secrets.
- Model and provider selection must be configuration-driven:
  - Model names should be set via env vars or via a single config module that reads env vars.
- Prefer one configuration module or file that centralizes provider and model settings.
- Do not scatter configuration constants across multiple unrelated scripts.

---

## Dependencies

- `pyproject.toml` is the source of truth for dependencies.
- If you also maintain `requirements.txt` files for `pip`, they must be kept in sync with `pyproject.toml` and documented in `README.md`.
- Prefer not adding new dependencies unless necessary.

---

## Testing

- Use `pytest` for tests.
- New features should include tests where practical.
- Bug fixes should include a regression test whenever feasible.

---

## CI/CD and deployment

- Each AI project should include a Docker setup and documented commands in `README.md`.

Expected examples:

```bash
docker build -t my-great-app .
docker run -it --rm -p 8000:8000 --env-file .env my-great-app
```

- Deployment target is typically Kubernetes on AWS EKS if needed.
- CI must run `pytest` on PRs and merges.

---

## Agent working rules

When making changes:

- Keep changes minimal and scoped to the task.
- Respect the existing folder structure and move files if they are in the wrong place.
- Update `README.md` if setup or run behavior changes.
- If you add a runnable script, ensure it follows the standalone script rules.
- If you add dependencies, update `pyproject.toml` accordingly.

---

## Quick checklist for contributions

- [ ] `__init__.py` present in all code folders
- [ ] No duplication (helpers in utils where appropriate)
- [ ] Clear separation of concerns (services vs utils vs scripts)
- [ ] Runnable scripts: docstring, argparse, `__main__`
- [ ] README updated if install, run, or other documentation changed
- [ ] Logging used instead of print
- [ ] pytest coverage added or updated when feasible
- [ ] Type hints present in all function signatures
