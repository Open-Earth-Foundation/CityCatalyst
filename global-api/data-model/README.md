# Data Model

Documentation of the CityCatalyst Global API database schema.

## Contents

```
data-model/
└── physical-model/
    ├── schema.dbml      # Full schema in DBML format (paste into dbdiagram.io)
    ├── schema.md        # Mermaid ER diagram — renders in GitHub / GitLab
    └── LAST_SYNCED.md   # Generation timestamp and Alembic revision
```

## Regenerating

The schema files are generated automatically from the Alembic migration history — no live database connection required.

```bash
python scripts/generate_schema.py
```

Run this after adding or modifying any migration in `migrations/versions/`.

## Viewing the schema

| Format | How to view |
|--------|-------------|
| `schema.dbml` | Paste into [dbdiagram.io](https://dbdiagram.io) |
| `schema.md` | Opens as a rendered Mermaid diagram on GitHub / GitLab |

## Schema overview

The database uses two schemas:

- **`public`** — legacy emissions and catalogue tables served by v0 API routes
- **`modelled`** — current analytical tables used by v1 routes and the CityCatalyst app

The current head revision and table count are recorded in `physical-model/LAST_SYNCED.md`.
