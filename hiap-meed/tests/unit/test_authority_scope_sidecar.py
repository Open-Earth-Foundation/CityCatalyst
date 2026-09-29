"""Deterministic contract tests for authority-scope-v1 sidecars and report binding."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.modules.prioritizer.authority_scope import (
    AUTHORITY_SCOPE_RUBRIC_VERSION,
    canonical_row_sha256,
    classifier_input_from_legal_row,
    resolve_report_authority_scope,
)
from app.modules.prioritizer.models import AuthorityScopeSidecarV1
from app.modules.prioritizer.report_context import build_chapter_inputs
from app.services.authority_scope_sidecar import (
    bind_sidecar_label_to_row,
    list_sidecar_keys_for_retention,
    parse_sidecar_payload,
    select_newest_matching_sidecar_key,
)
from app.services.openrouter_jev_client import (
    OpenRouterJevClient,
    build_authority_scope_decisions_request,
    parse_authority_scope_choice_answer,
)
from tests.unit.test_report_context import _enabled_legal_report_context


def _sample_classifier_input() -> dict[str, Any]:
    return classifier_input_from_legal_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        restrictions_category="enabled",
        ownership_description_en="Municipality has explicit legal authority to act directly.",
        ownership_description_es=None,
        restrictions_description_en="No legal restrictions; no additional authorization required.",
        restrictions_description_es=None,
        legal_justification_en="Limited to municipal premises; private owners require facilitation.",
        legal_justification_es=None,
        legal_references=["Law 18.695"],
    )


def _sample_sidecar(
    *,
    etag: str = '"etag-1"',
    row_hash: str | None = None,
    selected_label: str = "municipal_assets_only",
    confidence_passed: bool = True,
    confidence: float = 0.9,
) -> AuthorityScopeSidecarV1:
    classifier_input = _sample_classifier_input()
    digest = row_hash or canonical_row_sha256(classifier_input)
    payload = {
        "contract_version": "authority-scope-v1",
        "rubric_version": AUTHORITY_SCOPE_RUBRIC_VERSION,
        "model_id": "typesafe/jev-1.13",
        "confidence_threshold": 0.55,
        "source_s3_bucket": "test-global-api",
        "source_s3_key": (
            "raw_data/cl_ssg/cl_ssg_legal_signals/release/v2/"
            "legal-classification-v2.csv"
        ),
        "source_etag": etag,
        "source_last_modified": "2026-09-28T00:00:00+00:00",
        "generated_at_utc": "2026-09-28T12:00:00Z",
        "retention_keep_newest": 5,
        "records": [
            {
                "country_code": "CL",
                "action_id": "icare_0016",
                "canonical_row_sha256": digest,
                "selected_label": selected_label,
                "probabilities": {
                    "full_direct": 0.8 if selected_label == "full_direct" else 0.05,
                    "municipal_assets_only": (
                        0.8 if selected_label == "municipal_assets_only" else 0.05
                    ),
                    "qualified": 0.8 if selected_label == "qualified" else 0.1,
                    "unclassified": 0.8 if selected_label == "unclassified" else 0.05,
                },
                "chosen_label_probability": 0.8,
                "confidence": confidence,
                "confidence_threshold": 0.55,
                "confidence_passed": confidence_passed,
                "model_id": "typesafe/jev-1.13",
                "rubric_version": AUTHORITY_SCOPE_RUBRIC_VERSION,
                "classification_method": "ai_classified",
                "review_status": "human_accepted",
                "classified_at_utc": "2026-09-28T12:00:00Z",
                "human_decision": {
                    "editor_identity": "legal-owner@example",
                    "edited_at_utc": "2026-09-28T15:00:00Z",
                    "rationale": "Accepted the Jev label.",
                    "chosen_label": selected_label,
                },
            }
        ],
    }
    return parse_sidecar_payload(payload)


def test_sidecar_rejects_unknown_label_and_metadata_mismatch() -> None:
    """Unknown labels and mismatched record metadata fail closed at parse time."""
    sidecar = _sample_sidecar()
    payload = json.loads(sidecar.model_dump_json())
    payload["records"][0]["selected_label"] = "not_a_label"
    with pytest.raises(ValueError):
        parse_sidecar_payload(payload)

    payload = json.loads(sidecar.model_dump_json())
    payload["records"][0]["model_id"] = "typesafe/jev-other"
    with pytest.raises(ValueError):
        parse_sidecar_payload(payload)


def test_bind_rejects_etag_and_hash_mismatch() -> None:
    """Stale ETag or row-hash mismatches become conservative report scope."""
    classifier_input = _sample_classifier_input()
    sidecar = _sample_sidecar(etag='"etag-1"')

    stale_etag = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=classifier_input,
        sidecar=sidecar,
        source_etag='"etag-2"',
    )
    assert stale_etag["authority_scope_status"] == "stale_sidecar"
    assert stale_etag["authority_scope_report_label"] == "qualified"

    stale_hash = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=classifier_input,
        sidecar=_sample_sidecar(row_hash="0" * 64),
        source_etag='"etag-1"',
    )
    assert stale_hash["authority_scope_status"] == "stale_sidecar"
    assert stale_hash["authority_scope_report_label"] == "qualified"


def test_low_confidence_and_structural_conflict_fail_closed() -> None:
    """Low confidence and non-enabled verdicts never promote direct labels."""
    low = resolve_report_authority_scope(
        verdict_category="enabled",
        ownership_category="enabled",
        selected_label="full_direct",
        label_accepted=True,
        confidence_passed=False,
    )
    assert low == ("qualified", "low_confidence")

    conflict = resolve_report_authority_scope(
        verdict_category="conditional",
        ownership_category="enabled",
        selected_label="municipal_assets_only",
        label_accepted=True,
        confidence_passed=True,
    )
    assert conflict == ("qualified", "structural_conflict")


def test_retention_keeps_only_five_newest_sidecars() -> None:
    """Retention deletes only older objects under the exact sidecar prefix."""
    prefix = (
        "raw_data/cl_ssg/cl_ssg_legal_signals/release/v2/authority-scope/"
    )
    summaries = [
        {"Key": f"{prefix}authority-scope-v1-2026092{index}T120000Z.json"}
        for index in range(1, 8)
    ]
    summaries.append(
        {
            "Key": (
                "raw_data/cl_ssg/cl_ssg_legal_signals/release/v2/"
                "legal-classification-v2.csv"
            )
        }
    )
    keep_keys, delete_keys = list_sidecar_keys_for_retention(
        object_summaries=summaries,
        prefix=prefix,
        keep_newest=5,
    )
    assert len(keep_keys) == 5
    assert len(delete_keys) == 2
    assert all(key.startswith(prefix) for key in delete_keys)
    assert select_newest_matching_sidecar_key(
        object_summaries=summaries,
        prefix=prefix,
    ) == f"{prefix}authority-scope-v1-20260927T120000Z.json"


def test_report_path_never_imports_or_calls_jev(monkeypatch: pytest.MonkeyPatch) -> None:
    """Output-plan chapter building must not touch the OpenRouter Jev client."""
    called = False

    def _fail_classify(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal called
        called = True
        raise AssertionError("report path must not call Jev")

    monkeypatch.setattr(
        OpenRouterJevClient,
        "classify_authority_scope",
        _fail_classify,
    )
    chapters = {
        chapter.key: chapter
        for chapter in build_chapter_inputs(_enabled_legal_report_context())
    }
    assert chapters["legal_mandate_delivery"].facts["legal"]["authority_scope"] == (
        "qualified"
    )
    assert called is False


def test_jev_choice_parser_and_request_shape() -> None:
    """The dedicated Decisions adapter validates Choice answers tightly."""
    request = build_authority_scope_decisions_request(
        classifier_input=_sample_classifier_input(),
        model_id="typesafe/jev-1.13",
    )
    assert request["model"] == "typesafe/jev-1.13"
    assert request["questions"]["authority_scope"]["type"] == "choice"

    parsed = parse_authority_scope_choice_answer(
        {
            "model": "typesafe/jev-1.13-20260917",
            "answers": {
                "authority_scope": {
                    "type": "choice",
                    "choice": "municipal_assets_only",
                    "probabilities": {
                        "full_direct": 0.1,
                        "municipal_assets_only": 0.7,
                        "qualified": 0.15,
                        "unclassified": 0.05,
                    },
                    "confidence": 0.82,
                }
            },
            "usage": {"cost": 0.0001},
            "id": "gen-dec-test",
            "provider": "TypeSafe",
        }
    )
    assert parsed["selected_label"] == "municipal_assets_only"
    assert parsed["confidence"] == pytest.approx(0.82)


def test_evaluation_corpus_includes_piotr_cases() -> None:
    """The reviewed corpus must include the two PR #3172 counterexamples."""
    corpus_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "authority_scope"
        / "evaluation_corpus_v1.json"
    )
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    by_id = {case["case_id"]: case for case in corpus["cases"]}
    assert by_id["piotr_paraphrase_municipal_only"]["expected_report_scope"] == (
        "municipal_assets_only"
    )
    assert by_id["piotr_negation_full_direct"]["expected_report_scope"] == "full_direct"
    assert len(corpus["cases"]) >= 50


def test_pending_or_rejected_review_is_conservative() -> None:
    """Unapproved sidecar labels must not reach reports as release_validated."""
    classifier_input = _sample_classifier_input()
    for review_status, expected_status in (
        ("pending_human_review", "pending_human_review"),
        ("human_rejected", "human_rejected"),
    ):
        sidecar = _sample_sidecar()
        payload = json.loads(sidecar.model_dump_json())
        payload["records"][0]["review_status"] = review_status
        if review_status == "pending_human_review":
            payload["records"][0]["human_decision"] = None
        else:
            payload["records"][0]["human_decision"]["chosen_label"] = None
        bound = bind_sidecar_label_to_row(
            country_code="CL",
            action_id="icare_0016",
            verdict_category="enabled",
            ownership_category="enabled",
            classifier_input=classifier_input,
            sidecar=parse_sidecar_payload(payload),
            source_etag='"etag-1"',
        )
        assert bound["authority_scope_status"] == expected_status
        assert bound["authority_scope_report_label"] == "qualified"


def test_missing_source_etag_is_rejected() -> None:
    """A sidecar without a proven CSV ETag must not validate a label."""
    bound = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=_sample_classifier_input(),
        sidecar=_sample_sidecar(),
        source_etag=None,
    )
    assert bound["authority_scope_status"] == "missing_etag"
    assert bound["authority_scope_report_label"] == "qualified"


def test_inconsistent_confidence_fields_are_rejected() -> None:
    """Schema validation rejects confidence_passed that disagrees with numbers."""
    payload = json.loads(_sample_sidecar().model_dump_json())
    payload["records"][0]["confidence"] = 0.1
    payload["records"][0]["confidence_passed"] = True
    with pytest.raises(ValueError, match="failed schema validation"):
        parse_sidecar_payload(payload)


def test_missing_sidecar_does_not_fail_legal_bind() -> None:
    """Unavailable sidecar data maps to conservative wording without raising."""
    bound = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=_sample_classifier_input(),
        sidecar=None,
        source_etag='"etag-1"',
    )
    assert bound["authority_scope_report_label"] == "qualified"
    assert bound["authority_scope_status"] == "missing_sidecar"


def test_publication_allows_pending_ai_and_refuses_incomplete() -> None:
    """Jev may publish before review; an incomplete release still cannot."""
    from app.scripts.generate_authority_scope_sidecar import (
        assert_sidecar_ready_for_publication,
    )

    payload = json.loads(_sample_sidecar().model_dump_json())
    payload["records"][0]["review_status"] = "pending_human_review"
    payload["records"][0]["human_decision"] = None
    pending = parse_sidecar_payload(payload)
    assert_sidecar_ready_for_publication(
        sidecar=pending,
        expected_action_ids={"icare_0016"},
    )
    with pytest.raises(RuntimeError, match="incomplete"):
        assert_sidecar_ready_for_publication(
            sidecar=pending,
            expected_action_ids={"icare_0016", "icare_0121"},
        )


def test_publish_uses_reviewed_sidecar_without_reclassification(
    tmp_path: Path,
) -> None:
    """Publish must ship the reviewed artifact and never call the classifier again."""
    from app.modules.prioritizer.models import ActionLegalAssessmentS3CsvRow
    from app.scripts.generate_authority_scope_sidecar import (
        build_sidecar_from_rows,
        load_sidecar_from_path,
        publish_sidecar_and_retain,
        validate_sidecar_matches_csv_release,
    )

    class FakeJevClient:
        def __init__(self) -> None:
            self.calls = 0
            self._labels = ["municipal_assets_only", "full_direct"]

        def classify_authority_scope(
            self, *, classifier_input: dict[str, object], model_id: str | None = None
        ) -> dict[str, object]:
            del classifier_input, model_id
            label = self._labels[min(self.calls, len(self._labels) - 1)]
            self.calls += 1
            probabilities = {
                "full_direct": 0.1,
                "municipal_assets_only": 0.7,
                "qualified": 0.15,
                "unclassified": 0.05,
            }
            probabilities[label] = 0.7
            return {
                "selected_label": label,
                "probabilities": probabilities,
                "chosen_label_probability": 0.7,
                "confidence": 0.9,
            }

    class FakeS3Client:
        objects_ref: list[str] = []

        def __init__(self) -> None:
            self.objects: dict[str, bytes] = {}

        def put_object(
            self, *, Bucket: str, Key: str, Body: bytes, ContentType: str
        ) -> None:
            del Bucket, ContentType
            self.objects[Key] = Body
            FakeS3Client.objects_ref = list(self.objects)

        def head_object(self, *, Bucket: str, Key: str) -> dict[str, str]:
            del Bucket
            if Key not in self.objects:
                from botocore.exceptions import ClientError

                raise ClientError(
                    {"Error": {"Code": "404", "Message": "missing"}},
                    "HeadObject",
                )
            return {}

        def get_object(self, *, Bucket: str, Key: str) -> dict[str, object]:
            del Bucket
            from io import BytesIO

            return {"Body": BytesIO(self.objects[Key])}

        def get_paginator(self, name: str) -> object:
            assert name == "list_objects_v2"
            outer = self

            class _Paginator:
                def paginate(
                    self, *, Bucket: str, Prefix: str
                ) -> list[dict[str, object]]:
                    del Bucket
                    return [
                        {
                            "Contents": [
                                {"Key": key}
                                for key in outer.objects
                                if key.startswith(Prefix)
                            ]
                        }
                    ]

            return _Paginator()

        def delete_object(self, *, Bucket: str, Key: str) -> None:
            del Bucket
            self.objects.pop(Key, None)

    row = ActionLegalAssessmentS3CsvRow.model_validate(
        {
            "action_id": "icare_0016",
            "verdict_category": "enabled",
            "ownership_category": "enabled",
            "restrictions_category": "enabled",
            "ownership_description": "Municipality has explicit legal authority.",
            "legal_justification": "Limited to municipal premises.",
            "legal_justification_en": "Limited to municipal premises.",
        }
    )
    source_key = (
        "raw_data/cl_ssg/cl_ssg_legal_signals/release/v2/legal-classification-v2.csv"
    )
    fake_jev = FakeJevClient()
    reviewed = build_sidecar_from_rows(
        rows=[row],
        country_code="CL",
        source_bucket="test-global-api",
        source_key=source_key,
        source_etag='"etag-1"',
        source_last_modified=None,
        jev_client=fake_jev,  # type: ignore[arg-type]
    )
    assert fake_jev.calls == 1
    assert reviewed.records[0].selected_label == "municipal_assets_only"
    assert reviewed.records[0].review_status == "pending_human_review"
    assert reviewed.records[0].classification_method == "ai_classified"

    reviewed_path = tmp_path / "reviewed-sidecar.json"
    reviewed_path.write_text(reviewed.model_dump_json(indent=2) + "\n", encoding="utf-8")

    fake_jev._labels = ["full_direct"]
    calls_before_publish = fake_jev.calls
    loaded = load_sidecar_from_path(reviewed_path)
    validate_sidecar_matches_csv_release(
        sidecar=loaded,
        rows=[row],
        country_code="CL",
        source_bucket="test-global-api",
        source_key=source_key,
        source_etag='"etag-1"',
    )
    fake_s3 = FakeS3Client()
    published_key = publish_sidecar_and_retain(
        s3_client=fake_s3,
        sidecar=loaded,
        retain_newest=5,
        expected_action_ids={"icare_0016"},
    )

    assert fake_jev.calls == calls_before_publish
    published = json.loads(fake_s3.objects[published_key].decode("utf-8"))
    assert published["records"][0]["selected_label"] == "municipal_assets_only"
    assert published["records"][0]["review_status"] == "pending_human_review"
    assert published["records"][0]["classification_method"] == "ai_classified"


def _csv_row_matching_sample() -> Any:
    """Return the CSV row whose canonical hash matches `_sample_sidecar`."""
    from app.modules.prioritizer.models import ActionLegalAssessmentS3CsvRow

    return ActionLegalAssessmentS3CsvRow.model_validate(
        {
            "action_id": "icare_0016",
            "verdict_category": "enabled",
            "ownership_category": "enabled",
            "restrictions_category": "enabled",
            "ownership_description": (
                "Municipality has explicit legal authority to act directly."
            ),
            "restrictions_description": (
                "No legal restrictions; no additional authorization required."
            ),
            "legal_justification_en": (
                "Limited to municipal premises; private owners require facilitation."
            ),
            "legal_reference_1": "Law 18.695",
        }
    )


def _review_payload(
    *,
    row_hash: str,
    operation: str,
    chosen_label: str | None = None,
) -> dict[str, Any]:
    decision: dict[str, Any] = {
        "country_code": "CL",
        "action_id": "icare_0016",
        "canonical_row_sha256": row_hash,
        "operation": operation,
        "rationale": "Legal owner recorded a review decision.",
        "editor_identity": "legal-owner@example",
        "edited_at_utc": "2026-09-28T16:00:00Z",
    }
    if chosen_label is not None:
        decision["chosen_label"] = chosen_label
    return {"contract_version": "authority-scope-review-v1", "decisions": [decision]}


def _review_file(payload: dict[str, Any]) -> Any:
    from app.modules.prioritizer.models import AuthorityScopeReviewFileV1

    return AuthorityScopeReviewFileV1.model_validate(payload)


def test_review_accept_reject_and_direct_classify() -> None:
    """Review decisions keep Jev audit data and open a new sidecar timestamp."""
    from app.scripts.generate_authority_scope_sidecar import (
        apply_authority_scope_review,
    )

    row = _csv_row_matching_sample()
    pending = json.loads(_sample_sidecar().model_dump_json())
    pending["records"][0]["review_status"] = "pending_human_review"
    pending["records"][0]["human_decision"] = None
    sidecar = parse_sidecar_payload(pending)
    original_generated_at = sidecar.generated_at_utc
    row_hash = canonical_row_sha256(_sample_classifier_input())
    with pytest.raises(RuntimeError, match="does not match the current legal CSV row"):
        apply_authority_scope_review(
            sidecar=sidecar,
            review_file=_review_file(_review_payload(row_hash="0" * 64, operation="accept")),
            rows=[row],
            country_code="CL",
        )

    accepted = apply_authority_scope_review(
        sidecar=sidecar,
        review_file=_review_file(_review_payload(row_hash=row_hash, operation="accept")),
        rows=[row],
        country_code="CL",
    )
    assert accepted.generated_at_utc != original_generated_at
    assert accepted.records[0].review_status == "human_accepted"
    assert accepted.records[0].selected_label == "municipal_assets_only"
    assert accepted.records[0].model_id == "typesafe/jev-1.13"
    assert accepted.records[0].human_decision is not None
    assert accepted.records[0].human_decision.chosen_label == "municipal_assets_only"

    rejected = apply_authority_scope_review(
        sidecar=sidecar,
        review_file=_review_file(_review_payload(row_hash=row_hash, operation="reject")),
        rows=[row],
        country_code="CL",
    )
    rejected_bound = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=_sample_classifier_input(),
        sidecar=rejected,
        source_etag='"etag-1"',
    )
    assert rejected_bound["authority_scope_report_label"] == "qualified"
    assert rejected_bound["authority_scope_review_status"] == "human_rejected"

    direct = apply_authority_scope_review(
        sidecar=sidecar,
        review_file=_review_file(
            _review_payload(
                row_hash=row_hash,
                operation="direct_classify",
                chosen_label="full_direct",
            )
        ),
        rows=[row],
        country_code="CL",
    )
    assert direct.records[0].classification_method == "human_classified"
    assert direct.records[0].model_id is None
    assert direct.records[0].probabilities is None
    direct_bound = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=_sample_classifier_input(),
        sidecar=direct,
        source_etag='"etag-1"',
    )
    assert direct_bound["authority_scope_report_label"] == "full_direct"
    assert direct_bound["authority_scope_classification_method"] == "human_classified"


def test_pending_ai_full_direct_stays_qualified() -> None:
    """A confident Jev label cannot unlock a broad scope before human acceptance."""
    payload = json.loads(
        _sample_sidecar(selected_label="full_direct", confidence=0.9).model_dump_json()
    )
    payload["records"][0]["review_status"] = "pending_human_review"
    payload["records"][0]["human_decision"] = None
    bound = bind_sidecar_label_to_row(
        country_code="CL",
        action_id="icare_0016",
        verdict_category="enabled",
        ownership_category="enabled",
        classifier_input=_sample_classifier_input(),
        sidecar=parse_sidecar_payload(payload),
        source_etag='"etag-1"',
    )
    assert bound["authority_scope_report_label"] == "qualified"
    assert bound["authority_scope_status"] == "pending_human_review"
    assert bound["authority_scope_classification_method"] == "ai_classified"


def test_invalid_classification_pairs_are_rejected() -> None:
    """Schema validation rejects pairs outside the closed state table."""
    payload = json.loads(_sample_sidecar().model_dump_json())
    payload["records"][0]["classification_method"] = "human_classified"
    payload["records"][0]["review_status"] = "pending_human_review"
    with pytest.raises(ValueError, match="failed schema validation"):
        parse_sidecar_payload(payload)
    payload = json.loads(_sample_sidecar().model_dump_json())
    payload["records"][0]["classification_method"] = "ai_jev"
    with pytest.raises(ValueError, match="failed schema validation"):
        parse_sidecar_payload(payload)


def test_pending_scope_is_not_left_to_chapter_prose() -> None:
    """Chapter limitations do not own the review status; metadata does."""
    from app.modules.prioritizer.internal_models import LegalAssessmentRecord
    from app.modules.prioritizer.report_context import (
        authority_scope_classification_metadata,
    )

    assessment = LegalAssessmentRecord(
        action_id="A_1",
        country_code="CL",
        verdict_category="enabled",
        ownership_category="enabled",
        authority_scope_selected_label="full_direct",
        authority_scope_report_label="qualified",
        authority_scope_status="pending_human_review",
        authority_scope_confidence_passed=True,
        authority_scope_review_status="pending_human_review",
        authority_scope_classification_method="ai_classified",
    )
    chapters = {
        chapter.key: chapter
        for chapter in build_chapter_inputs(
            _enabled_legal_report_context(legal_assessment=assessment)
        )
    }
    assert chapters["legal_mandate_delivery"].facts["legal"]["authority_scope"] == (
        "qualified"
    )
    assert "authority_scope_classification" not in chapters["sources_assumptions"].facts
    metadata = authority_scope_classification_metadata(assessment)
    assert metadata is not None
    assert metadata.classification_method == "ai_classified"
    assert metadata.review_status == "pending_human_review"


def test_corpus_release_gate_records_legacy_disagreements() -> None:
    """Schema checks pass, and the two live disagreements are not blockers."""
    from app.scripts.evaluate_authority_scope_corpus import (
        RECORDED_MODEL_OUTCOME,
        live_gate_passed,
        load_corpus,
        validate_release_regressions,
    )

    corpus_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "authority_scope"
        / "evaluation_corpus_v1.json"
    )
    corpus = load_corpus(corpus_path)
    assert validate_release_regressions(corpus) == []
    by_id = {case["case_id"]: case for case in corpus["cases"]}
    for case_id in ("ssg_c40_0029", "ssg_icare_0012"):
        assert by_id[case_id]["live_comparison"] == RECORDED_MODEL_OUTCOME
        passed, recorded = live_gate_passed(
            by_id[case_id], report_label="qualified"
        )
        assert passed is True
        assert recorded is True
    piotr_passed, piotr_recorded = live_gate_passed(
        by_id["piotr_negation_full_direct"],
        report_label="municipal_assets_only",
    )
    assert piotr_passed is False
    assert piotr_recorded is False
