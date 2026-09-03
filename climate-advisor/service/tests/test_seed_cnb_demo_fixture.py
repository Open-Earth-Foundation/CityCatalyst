"""Tests for the portable CNB demo fixture seeder."""

import hashlib
import json
from pathlib import Path
from uuid import UUID

import pytest

from service.scripts.seed_cnb_demo_fixture import (
    _build_seed_replacements,
    _replace_fixture_identifiers,
    _validate_fixture,
)


CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "relative_path",
    [
        Path("fixtures/cnb/krakow/krakow-demo.json"),
        Path("fixtures/cnb/richfield/richfield-demo.json"),
    ],
)
def test_tracked_fixture_document_integrity(relative_path: Path) -> None:
    fixture_path = CLIMATE_ADVISOR_ROOT / relative_path
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))

    _validate_fixture(payload, fixture_path)


def test_validate_fixture_checks_document_integrity(tmp_path) -> None:
    document = tmp_path / "source.pdf"
    document.write_bytes(b"portable demo")
    payload = {
        "schema_version": 1,
        "source": {
            "document": {
                "filename": document.name,
                "bytes": document.stat().st_size,
                "sha256": hashlib.sha256(document.read_bytes()).hexdigest(),
            }
        },
    }

    _validate_fixture(payload, tmp_path / "fixture.json")

    document.write_bytes(b"changed")
    with pytest.raises(ValueError, match="size does not match"):
        _validate_fixture(payload, tmp_path / "fixture.json")


def test_run_override_remaps_all_run_scoped_identifiers() -> None:
    source_run_id = "e7cca88d-de54-4050-88ed-d6b39790853b"
    destination_run_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    source_thread_id = "bcb8b5f0-d2ed-498f-aa37-90e89d78798e"
    destination_thread_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    chapter_id = "11111111-2222-4333-8444-555555555555"
    revision_id = "66666666-7777-4888-8999-aaaaaaaaaaaa"
    idempotency_key = "cccccccc-dddd-4eee-8fff-000000000000"
    payload = {
        "source": {
            "run_id": source_run_id,
            "city_id": "source-city",
            "thread_id": source_thread_id,
        },
        "ca": {
            "concept_note_runs": [
                {
                    "run_id": source_run_id,
                    "thread_id": source_thread_id,
                    "user_id": "__DEMO_USER_ID__",
                    "city_id": "__DEMO_CITY_ID__",
                    "idempotency_key": idempotency_key,
                }
            ],
            "concept_note_uploads": [],
            "messages": [],
        },
        "cnb": {
            "concept_note_chapters": [
                {"chapter_id": chapter_id, "run_id": source_run_id}
            ],
            "concept_note_chapter_revisions": [
                {"revision_id": revision_id, "chapter_id": chapter_id}
            ],
        },
    }

    replacements = _build_seed_replacements(
        payload,
        "demo-user",
        "demo-city",
        destination_run_id,
        destination_thread_id,
    )
    seeded = _replace_fixture_identifiers(payload, replacements)

    UUID(replacements[chapter_id])
    UUID(replacements[revision_id])
    assert replacements[chapter_id] != chapter_id
    assert replacements[revision_id] != revision_id
    assert replacements[idempotency_key] != idempotency_key
    assert seeded["ca"]["concept_note_runs"][0] == {
        "run_id": destination_run_id,
        "thread_id": destination_thread_id,
        "user_id": "demo-user",
        "city_id": "demo-city",
        "idempotency_key": replacements[idempotency_key],
    }
    assert (
        seeded["cnb"]["concept_note_chapter_revisions"][0]["chapter_id"]
        == replacements[chapter_id]
    )


def test_same_run_seed_preserves_fixture_primary_keys() -> None:
    source_run_id = "e7cca88d-de54-4050-88ed-d6b39790853b"
    chapter_id = "11111111-2222-4333-8444-555555555555"
    payload = {
        "source": {
            "run_id": source_run_id,
            "city_id": "source-city",
            "thread_id": "bcb8b5f0-d2ed-498f-aa37-90e89d78798e",
        },
        "ca": {},
        "cnb": {
            "concept_note_chapters": [
                {"chapter_id": chapter_id, "run_id": source_run_id}
            ]
        },
    }

    replacements = _build_seed_replacements(
        payload,
        "demo-user",
        "demo-city",
        source_run_id,
        payload["source"]["thread_id"],
    )

    assert chapter_id not in replacements
