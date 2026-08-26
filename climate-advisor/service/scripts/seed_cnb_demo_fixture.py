"""
Brief: Seed a portable Concept Note Builder demo fixture into local databases.

Inputs:
- `--fixture`: sanitized JSON fixture path; defaults to the tracked Krakow demo.
- `--ca-database-url`: CA PostgreSQL URL; defaults to `CA_DATABASE_URL`.
- `--cnb-database-url`: managed CNB PostgreSQL URL; defaults to
  `CNB_DATABASE_URL`.
- `--user-id`: destination owner; defaults to `CNB_DEMO_USER_ID` or the
  deterministic local smoke user.
- `--city-id`: destination city; defaults to `CNB_DEMO_CITY_ID` or the Krakow
  demo city.
- `--run-id`: optional destination run UUID. A new value deterministically
  remaps every run-scoped child UUID to avoid collisions.
- `--thread-id`: optional destination thread UUID.

Outputs:
- Verifies the tracked source document against the fixture SHA-256 metadata.
- Upserts reference, run, chat, chapter, revision, gap, resolution, and review
  records without deleting unrelated local data.
- Logs the local CityCatalyst route to open after seeding.

Usage (from `climate-advisor`):
- uv run --directory service python -m scripts.seed_cnb_demo_fixture
- uv run --directory service python -m scripts.seed_cnb_demo_fixture \
    --user-id <local-user-uuid> --city-id <local-city-uuid> \
    --run-id <new-run-uuid>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import connection as PgConnection
from psycopg2.extras import Json

logger = logging.getLogger(__name__)

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE = (
    CLIMATE_ADVISOR_ROOT / "fixtures" / "cnb" / "krakow" / "krakow-demo.json"
)
DEFAULT_USER_ID = "11111111-1111-4111-8111-111111111111"
DEFAULT_CITY_ID = "f8063baa-e795-4ffb-a507-7a2ea6090eae"

CA_TABLE_KEYS = {
    "concept_note_runs": "run_id",
    "concept_note_context_bundles": "run_id",
    "concept_note_uploads": "upload_id",
    "threads": "thread_id",
    "messages": "message_id",
}

CNB_TABLE_KEYS = {
    "funders": "funder_id",
    "funding_opportunities": "funding_opportunity_id",
    "funded_projects": "funded_project_id",
    "source_documents": "source_document_id",
    "funder_templates": "template_id",
    "funder_criteria": "criterion_id",
    "funding_evidence": "evidence_id",
    "concept_note_chapters": "chapter_id",
    "concept_note_chapter_revisions": "revision_id",
    "concept_note_evidence_links": "evidence_link_id",
    "concept_note_gaps": "gap_id",
    "concept_note_gap_resolutions": "resolution_id",
    "concept_note_chapter_reviews": "review_id",
    "concept_note_matched_projects": "match_id",
}

RUN_SCOPED_KEYS = {
    "concept_note_uploads": "upload_id",
    "messages": "message_id",
    "concept_note_chapters": "chapter_id",
    "concept_note_chapter_revisions": "revision_id",
    "concept_note_evidence_links": "evidence_link_id",
    "concept_note_gaps": "gap_id",
    "concept_note_gap_resolutions": "resolution_id",
    "concept_note_chapter_reviews": "review_id",
    "concept_note_matched_projects": "match_id",
}


def _require_database_url(value: str | None, name: str) -> str:
    """Return a configured database URL or raise a concise CLI error."""
    if value:
        return value
    raise ValueError(f"{name} is required as a CLI argument or environment variable")


def _sha256(path: Path) -> str:
    """Return the lowercase SHA-256 digest for one file."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_fixture(payload: dict[str, Any], fixture_path: Path) -> None:
    """Validate schema version and the colocated source document's integrity."""
    if payload.get("schema_version") != 1:
        raise ValueError("Unsupported fixture schema_version; expected 1")

    document_metadata = payload["source"]["document"]
    document_path = fixture_path.parent / document_metadata["filename"]
    if not document_path.is_file():
        raise ValueError(f"Fixture source document does not exist: {document_path}")
    if document_path.stat().st_size != document_metadata["bytes"]:
        raise ValueError(
            f"Fixture source document size does not match: {document_path}"
        )
    if _sha256(document_path) != document_metadata["sha256"].lower():
        raise ValueError(
            f"Fixture source document hash does not match: {document_path}"
        )


def _replace_fixture_identifiers(value: Any, replacements: dict[str, str]) -> Any:
    """Recursively replace fixture identifiers for one destination run."""
    if isinstance(value, dict):
        return {
            key: _replace_fixture_identifiers(child, replacements)
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [_replace_fixture_identifiers(item, replacements) for item in value]
    if isinstance(value, str):
        return replacements.get(value, value)
    return value


def _build_seed_replacements(
    payload: dict[str, Any],
    user_id: str,
    city_id: str,
    run_id: str,
    thread_id: str,
) -> dict[str, str]:
    """Build stable replacements for ownership and run-scoped identifiers."""
    source = payload["source"]
    replacements = {
        "__DEMO_USER_ID__": user_id,
        "__DEMO_CITY_ID__": city_id,
        source["run_id"]: run_id,
        source["city_id"]: city_id,
    }
    if source["thread_id"]:
        replacements[source["thread_id"]] = thread_id

    if run_id == source["run_id"]:
        return replacements

    # A run override gets its own stable namespace, so seeding a clone cannot
    # reassign the source fixture's chapters, gaps, messages, or audit rows.
    namespace = UUID(run_id)
    for section in payload["ca"], payload["cnb"]:
        for table_name, primary_key in RUN_SCOPED_KEYS.items():
            for row in section.get(table_name, []):
                source_id = row.get(primary_key)
                if source_id:
                    replacements[source_id] = str(
                        uuid5(namespace, f"{table_name}:{source_id}")
                    )

        for rows in section.values():
            for row in rows:
                idempotency_key = row.get("idempotency_key")
                if idempotency_key:
                    replacements[idempotency_key] = str(
                        uuid5(namespace, f"idempotency:{idempotency_key}")
                    )
    return replacements


def _database_value(value: Any) -> Any:
    """Adapt JSON containers for psycopg2 while leaving scalars unchanged."""
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


def _upsert_rows(
    connection: PgConnection,
    table_name: str,
    primary_key: str,
    rows: list[dict[str, Any]],
) -> None:
    """Upsert fixture rows by primary key without deleting unrelated data."""
    for row in rows:
        columns = list(row)
        update_columns = [column for column in columns if column != primary_key]
        query = sql.SQL("INSERT INTO {table} ({columns}) VALUES ({values}) ").format(
            table=sql.Identifier(table_name),
            columns=sql.SQL(", ").join(sql.Identifier(column) for column in columns),
            values=sql.SQL(", ").join(sql.Placeholder() for _ in columns),
        )
        if update_columns:
            query += sql.SQL(
                "ON CONFLICT ({primary_key}) DO UPDATE SET {updates}"
            ).format(
                primary_key=sql.Identifier(primary_key),
                updates=sql.SQL(", ").join(
                    sql.SQL("{column} = EXCLUDED.{column}").format(
                        column=sql.Identifier(column)
                    )
                    for column in update_columns
                ),
            )
        else:
            query += sql.SQL("ON CONFLICT ({primary_key}) DO NOTHING").format(
                primary_key=sql.Identifier(primary_key)
            )
        with connection.cursor() as cursor:
            cursor.execute(query, [_database_value(row[column]) for column in columns])


def _seed_ca_rows(
    connection: PgConnection,
    rows: dict[str, list[dict[str, Any]]],
) -> None:
    """Upsert CA run data in foreign-key-safe order."""
    for table_name in (
        "threads",
        "concept_note_runs",
        "concept_note_context_bundles",
        "concept_note_uploads",
        "messages",
    ):
        _upsert_rows(
            connection, table_name, CA_TABLE_KEYS[table_name], rows[table_name]
        )


def _seed_cnb_rows(
    connection: PgConnection,
    rows: dict[str, list[dict[str, Any]]],
) -> None:
    """Upsert reference and workspace data in foreign-key-safe order."""
    chapter_rows = rows["concept_note_chapters"]
    confirmed_revisions = {
        row["chapter_id"]: row.get("confirmed_revision_id")
        for row in chapter_rows
        if row.get("confirmed_revision_id")
    }
    chapters_without_confirmation = [
        {**row, "confirmed_revision_id": None} for row in chapter_rows
    ]

    # Seed curated reference records before their dependent workspace rows.
    for table_name in (
        "funders",
        "funding_opportunities",
        "funded_projects",
        "source_documents",
        "funder_templates",
        "funder_criteria",
        "funding_evidence",
    ):
        _upsert_rows(
            connection, table_name, CNB_TABLE_KEYS[table_name], rows[table_name]
        )

    # Break the chapter/revision cycle until immutable revisions are present.
    _upsert_rows(
        connection,
        "concept_note_chapters",
        CNB_TABLE_KEYS["concept_note_chapters"],
        chapters_without_confirmation,
    )
    for table_name in (
        "concept_note_chapter_revisions",
        "concept_note_evidence_links",
        "concept_note_gaps",
        "concept_note_gap_resolutions",
        "concept_note_chapter_reviews",
        "concept_note_matched_projects",
    ):
        _upsert_rows(
            connection, table_name, CNB_TABLE_KEYS[table_name], rows[table_name]
        )

    # Restore exact confirmed revision pointers after revisions exist.
    with connection.cursor() as cursor:
        for chapter_id, revision_id in confirmed_revisions.items():
            cursor.execute(
                "UPDATE concept_note_chapters SET confirmed_revision_id = %s "
                "WHERE chapter_id = %s",
                (revision_id, chapter_id),
            )


def seed_fixture(args: argparse.Namespace) -> None:
    """Seed the fixture for a chosen local user, city, and optional run UUID."""
    ca_database_url = _require_database_url(args.ca_database_url, "CA_DATABASE_URL")
    cnb_database_url = _require_database_url(args.cnb_database_url, "CNB_DATABASE_URL")
    fixture_path = Path(args.fixture).resolve()
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    _validate_fixture(payload, fixture_path)

    # Map fixture ownership and optionally isolate every run-scoped UUID.
    source = payload["source"]
    destination_run_id = args.run_id or source["run_id"]
    destination_thread_id = args.thread_id or (
        source["thread_id"]
        if destination_run_id == source["run_id"]
        else str(uuid5(UUID(destination_run_id), "thread"))
    )
    replacements = _build_seed_replacements(
        payload,
        args.user_id,
        args.city_id,
        destination_run_id,
        destination_thread_id,
    )
    ca_rows = _replace_fixture_identifiers(payload["ca"], replacements)
    cnb_rows = _replace_fixture_identifiers(payload["cnb"], replacements)
    ca_rows["concept_note_runs"][0]["request_fingerprint"] = hashlib.sha256(
        f"{args.user_id}:{args.city_id}:{destination_run_id}".encode()
    ).hexdigest()

    # Seed each independent database transactionally. Reruns are idempotent.
    with psycopg2.connect(cnb_database_url) as cnb_connection:
        _seed_cnb_rows(cnb_connection, cnb_rows)
    with psycopg2.connect(ca_database_url) as ca_connection:
        _seed_ca_rows(ca_connection, ca_rows)

    route = f"/en/cities/{args.city_id}/concept-notes/{destination_run_id}/"
    logger.info("Seeded %s", payload["fixture_name"])
    logger.info("Open http://localhost:3000%s", route)


def parse_args() -> argparse.Namespace:
    """Parse local fixture seed arguments."""
    parser = argparse.ArgumentParser(
        description="Seed a sanitized Concept Note Builder demo fixture."
    )
    parser.add_argument(
        "--fixture",
        default=str(DEFAULT_FIXTURE),
        help="Source JSON fixture path.",
    )
    parser.add_argument(
        "--ca-database-url",
        default=os.getenv("CA_DATABASE_URL"),
        help="CA PostgreSQL URL; defaults to CA_DATABASE_URL.",
    )
    parser.add_argument(
        "--cnb-database-url",
        default=os.getenv("CNB_DATABASE_URL"),
        help="Managed CNB PostgreSQL URL; defaults to CNB_DATABASE_URL.",
    )
    parser.add_argument(
        "--user-id",
        default=os.getenv("CNB_DEMO_USER_ID", DEFAULT_USER_ID),
        help="Local CityCatalyst user UUID that will own the seeded run.",
    )
    parser.add_argument(
        "--city-id",
        default=os.getenv("CNB_DEMO_CITY_ID", DEFAULT_CITY_ID),
        help="Local CityCatalyst city UUID used in the seeded route.",
    )
    parser.add_argument(
        "--run-id",
        help="Optional destination run UUID; defaults to the fixture run UUID.",
    )
    parser.add_argument(
        "--thread-id",
        help="Optional destination thread UUID; defaults to a stable fixture UUID.",
    )
    return parser.parse_args()


def main() -> None:
    """Seed the configured local CNB demo fixture."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    seed_fixture(parse_args())


if __name__ == "__main__":
    main()
