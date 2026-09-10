"""Model-facing CNB projection keeps facts while excluding identity metadata."""

from copy import deepcopy

from app.utils.concept_note_context import omit_context_identifiers


def test_identifier_projection_covers_nested_fields_without_mutating_source():
    payload = {
        "concept_note_run_id": "run-secret",
        "context_bundle_status": {
            "build_id": "build-secret",
            "source_fingerprint": "fingerprint-secret",
            "status": "ready",
            "source_counts": {"ready": 1},
        },
        "selected_sources": [
            {
                "upload_id": "upload-secret",
                "source_label": "City plan",
                "filename": "plan.pdf",
                "sha256": "hash-secret",
                "analysis_contract_version": "contract-hash",
                "summary": "Transport priorities.",
                "page_count": 10,
                "block_count": None,
            }
        ],
        "cc_context": {"city": {"cityId": "city-secret", "name": "Example City"}},
        "funder_context": {"ID": "funder-secret", "name": "Example Fund"},
        "similar_projects": [{"projectUUID": "project-secret", "budget": 123}],
        "document_context": {"chapter_ids": ["chapter-secret"], "title": "Proposal"},
    }
    original = deepcopy(payload)

    assert omit_context_identifiers(payload) == {
        "context_bundle_status": {"status": "ready", "source_counts": {"ready": 1}},
        "selected_sources": [
            {
                "source_label": "City plan",
                "filename": "plan.pdf",
                "summary": "Transport priorities.",
                "page_count": 10,
                "block_count": None,
            }
        ],
        "cc_context": {"city": {"name": "Example City"}},
        "funder_context": {"name": "Example Fund"},
        "similar_projects": [{"budget": 123}],
        "document_context": {"title": "Proposal"},
    }
    assert payload == original


def test_projection_preserves_facts_and_does_not_match_id_substrings():
    assert omit_context_identifiers(
        {
            "grid": "electricity",
            "paid": False,
            "solid": 0,
            "identification_method": "survey",
            "topics": ["biodiversity"],
            "metadata": {
                "sourceFingerprint": "secret",
                "contentHash": "secret",
                "uuid": "secret",
            },
        }
    ) == {
        "grid": "electricity",
        "paid": False,
        "solid": 0,
        "identification_method": "survey",
        "topics": ["biodiversity"],
        "metadata": {},
    }
