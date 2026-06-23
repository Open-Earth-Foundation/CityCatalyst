# AGENTS.md

## Purpose

This repository subtree contains a single AI project. All contributions must optimize for:

- **Readability**: clear docs, clean structure, no dead or unused code, and a logical separation of concerns.
- **Maintainability**: reusable utilities, configuration-driven behavior, proper logging, minimal duplication.
- **Consistency**: a similar feel across routes, services, tools, prompts, and scripts via shared patterns and conventions.

---

## Cursor Agent Skills (project-level)

This repo includes **project-level Cursor skills** under `../.cursor/skills/` from this subtree, which is the repository-root `.cursor/skills/` directory. These skills are available to anyone who checks out the repository and opens it in Cursor.

Skills included:

- `simplify-after-change`: **Mandatory** after any code change. Simplifies the changed code, removes unnecessary complexity, and keeps behavior identical.
- `docs-after-change`: **Mandatory** after any code change. Keeps docstrings, README, and architecture docs accurate.
- `script-quality-gate`: Use when adding or changing a runnable script or CLI entrypoint.
- `repo-doc-audit`: One-off full repo documentation audit (**manual** via `/repo-doc-audit`).
- `prompt-schema-authoring`: Use when creating or updating prompt files under `prompts/`.

### Mandatory after code changes

After **any code change** (add/edit/delete/rename), you must apply BOTH skills before ending your turn:

1. `simplify-after-change`
2. `docs-after-change`

If you intentionally skip a mandatory skill, leave a one-line justification in your response message.

---

## Documentation requirements

### README.md must be up to date

`climate-advisor/README.md` must stay accurate for:

- local setup with `uv`
- Docker and Postgres setup
- service run commands
- test and migration workflows
- required environment variables
- prompt and model configuration behavior when it changes

### Runnable scripts must have a top-level docstring

Every script intended to be executed must include a **top-level docstring** describing:

- what the script does
- inputs (files, env vars, CLI args) with enough detail to be self-explanatory
- outputs (files, stdout, DB writes, API responses)
- usage examples from the project root

---

## Code organization

### Separation of concerns is mandatory

- FastAPI app code lives in `service/app/`.
- API routes belong in `service/app/routes/`.
- orchestration and business logic belong in `service/app/services/`.
- external tool integrations belong in `service/app/tools/`.
- cross-cutting helpers belong in `service/app/utils/`.
- database session and persistence wiring belong in `service/app/db/` and `service/app/models/`.
- top-level operational scripts belong in `scripts/` or `service/scripts/`, depending on whether they are repo-level or service-level.
- prompts belong in `prompts/` and should be referenced through `llm_config.yaml` or explicit loader paths, not duplicated inline unless there is a strong reason.

### Folder placement must follow the existing hierarchy

All directories containing code must include an `__init__.py` file to ensure proper package resolution. These files must be **empty or contain only a module-level docstring** - do not add imports or re-exports. Because the project uses absolute imports exclusively, convenience re-exports in `__init__.py` are unnecessary and risk introducing circular imports.

Use the established Climate Advisor layout:

```text
climate-advisor/
│
├── prompts/                    # Markdown prompt files used by runtime config
├── scripts/                    # Top-level operational scripts
├── service/                    # FastAPI service package and migrations
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint
│   │   ├── config/             # Settings, feature flags, LLM config loaders
│   │   ├── db/                 # DB session and persistence setup
│   │   ├── middleware/         # Request context and middleware
│   │   ├── models/             # DB and API models
│   │   ├── routes/             # HTTP endpoints
│   │   ├── services/           # Agent, embedding, CityCatalyst, workflow logic
│   │   ├── tools/              # Tool implementations exposed to the agent
│   │   └── utils/              # Shared helpers
│   ├── migrations/             # Alembic migrations
│   ├── scripts/                # Service-scoped scripts
│   └── tests/                  # pytest suite
├── docs/                       # Project docs
├── k8s/                        # Deployment manifests
├── vector_db/                  # Vector database assets and utilities
├── llm_config.yaml             # Model, prompt, and tool configuration
├── pyproject.toml              # Dependency source of truth
├── uv.lock
├── .env.example
└── README.md
```

Notes:

- Do not commit `.env`.
- Keep prompt text in `prompts/` whenever the runtime already supports external prompt files.
- Follow the existing package structure instead of introducing parallel folders for the same concern.

---

## Prompt rules

Prompt files for Climate Advisor live in `prompts/`, and `llm_config.yaml` is the source of truth for which prompt files are active.

Full prompt files referenced by `llm_config.yaml` must use the required prompt schema. Reusable include fragments, such as `prompts/tools/*.md`, are runtime prompt fragments used by those full prompts; they may contain only focused tool policy or argument-contract text and do not need their own `<role>`, `<task>`, `<input>`, or `<output>` blocks unless they become directly configured prompt entries.

Tool policy fragments are not developer guidelines. They instruct the runtime model when and how to use application tools. `AGENTS.md` remains the source of truth for contribution rules and code standards.

When editing prompts:

- use the `prompt-schema-authoring` skill
- keep the required structure: `<role>`, `<task>`, `<input>`, `<output>`
- add `<tools>` when tool policy matters
- add `<example_output>` whenever practical
- ensure the prompt contract matches the runtime payload actually passed by the service
- if you change output structure, update parsing, coercion, models, and tests in the same change

Do not let prompt content drift from:

- `llm_config.yaml`
- `service/app/services/agent_service.py`
- any model or parsing logic that consumes prompt output

---

## Standalone scripts rules

Any script that can be executed standalone must:

1. Live under `scripts/` or `service/scripts/`
2. Have a top-level docstring
3. Use `argparse` for inputs when it is a CLI
4. Include a `__main__` entry point
5. Avoid side effects at import time

Use `script-quality-gate` when you add or change one.

---

## Maintainability rules

### Prefer reuse over duplication

- If logic is reusable, put it in `service/app/utils/`, `service/app/services/`, or `service/app/tools/` as appropriate.
- Do not copy prompt-loading, HTTP-client, token, or database logic across modules.

### Docstrings are required

- Every production Python function and method should have a docstring.
- Trivial production functions can use a one-liner.
- Non-trivial or side-effecting production functions should describe inputs, outputs, side effects, and raised exceptions when non-obvious.
- Tests should use descriptive names. Add test docstrings only when the setup or intent is not obvious from the name and assertions.

### Logging is required

- Use Python's `logging` module, not `print`, except for rare intentional CLI UX cases.
- Follow the established module-level logger pattern: `logger = logging.getLogger(__name__)`.
- Reuse the service's existing logging setup instead of inventing per-module logging configuration.
- Do not log secrets, tokens, or raw credentials.
- Log key steps and important parameters, do not log secrets.
- Log exceptions with stack traces where helpful.

### Remove dead code

- No unused functions, no commented-out blocks, no maybe later code.
- If it is not used and not needed now, delete it.

### Type hints

- All production function signatures must have Python type hints.
- Reusable test helpers and fixtures should be typed where practical; decorator-injected mock parameters may stay untyped if the type would add noise.
- Prefer concrete return types and avoid `Any` unless justified.

### Path handling

- Use `pathlib.Path` instead of `os.path` or string-built paths.

### Prefer simple functions over heavy class hierarchies

- Prefer functional code and small, testable functions.
- Use classes only when they clearly reduce complexity (for example a small client wrapper), keep them thin.

### Module imports

- Strictly use **absolute imports**, for example `from app.utils.foo import bar`. Do not use relative imports.
- Always run scripts as modules using `python -m ...` from the project root.
- Do not define module-level `__all__` export lists. With absolute imports, explicit symbol imports at the call site are clearer and avoid hidden export contracts.
- **Never use wildcard imports** (`from module import *`). Always explicitly name the functions, classes, or objects you are importing.
  - Bad: `from app.utils.helpers import *`
  - Good: `from app.utils.helpers import parse_config, validate_input`

### Prefer clarity over cleverness

- Prefer clear, explicit code over overly compact code.
- Avoid dense one-liners, deeply nested comprehensions, and overly abstract helper chains when they reduce readability.
- Optimize for the next person reading the code, not for brevity.

### Logical block comments inside functions

- Always use short `#` comments to mark **logical blocks** in non-trivial functions (for example: `# Step 1: validate input`, `# Apply hard legal gate`).
- In orchestration-style functions, clearly separate fetch, transform, scoring, artifact/logging, and response assembly sections with these comments.
- Prefer comments that explain **why/intent**, not line-by-line restatements of obvious code.
- Keep comments concise and stable; avoid noisy or redundant comments.
- Treat these comments as required readability scaffolding, not an optional style preference.

---

## Configuration and secrets

- Secrets go only in the runtime environment.
- Use `.env.example` to document required variables without real secrets.
- Keep model, provider, prompt, and tool settings centralized in `llm_config.yaml` and `service/app/config/`.
- Do not scatter model names, prompt paths, or provider-specific constants across unrelated files.

---

## Dependencies

- `pyproject.toml` is the source of truth for dependencies.
- `uv.lock` must stay in sync with `pyproject.toml`.
- Prefer not adding new dependencies unless necessary.

---

## Testing

- Use `pytest`.
- Service tests live under `service/tests/`.
- New features should include tests where practical.
- Bug fixes should include a regression test whenever feasible.
- If you change prompts, tool outputs, or workflow contracts, update or add tests that exercise those paths.

---

## CI/CD and deployment

- Keep Docker and Kubernetes instructions consistent with the actual files in `Dockerfile`, `docker-compose.yml`, and `k8s/`.
- If run or deploy commands change, update `README.md` in the same change.

---

## Agent working rules

When making changes:

- Keep changes minimal and scoped to the task.
- Do not add backward-compatibility layers, legacy adapters, or dual-path behavior unless the user explicitly requests backward compatibility.
- Respect the existing folder structure.
- Update `README.md`, `llm_config.yaml`, or prompt docs when behavior changes.
- If you add or modify a runnable script, ensure it follows the standalone script rules.
- If you add or modify a prompt, ensure it follows the prompt schema rules.

---

## Quick checklist for contributions

- [ ] Docs updated if setup, prompts, or run behavior changed
- [ ] `__init__.py` present in all code folders (empty or docstring-only - no imports or re-exports)
- [ ] No module-level `__all__` export lists
- [ ] Prompt files remain aligned with runtime payloads and output parsers
- [ ] Scripts follow docstring and CLI rules
- [ ] No duplication (helpers in utils where appropriate)
- [ ] Clear separation of concerns (services vs utils vs scripts)
- [ ] Logging used instead of print
- [ ] pytest coverage added or updated when feasible
- [ ] Type hints present in all function signatures
- [ ] `pyproject.toml` and `uv.lock` stay consistent
- [ ] Relevant tests run, or inability to run explained
