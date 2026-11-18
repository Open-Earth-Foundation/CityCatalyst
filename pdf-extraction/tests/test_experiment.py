"""Frozen paired evaluation: failures, set separation, selection and input drift."""

import pytest
import httpx
import time

from examples import experiment
from examples.import_key_tables import example_numbers
from examples.extract import get_job, wait_result


def attempt(
    condition, recall, precision=None, total=True, accepted=True, stage="round2"
):
    """Create an independently chosen measured outcome without running providers."""
    return {
        "condition": condition,
        "stage": stage,
        "totalOnly": False,
        "pipelineAccepted": accepted,
        "score": {
            "rowRecall": recall,
            "rowPrecision": recall if precision is None else precision,
            "classificationAccuracy": None,
        },
        "strictTotalPassed": total,
    }


def test_balanced_matrix_excludes_unusable_and_heldout_inputs():
    """Exactly 66 jobs cover the 11 agreed cases under both conditions three times."""
    jobs = experiment.workload("round2")
    assert len(jobs) == 66
    assert len({job["id"] for job in jobs}) == 66
    assert {job["case"] for job in jobs} == set(experiment.ROUND2)
    for case in experiment.ROUND2:
        for condition in ["off", "on"]:
            assert sorted(
                job["repeat"]
                for job in jobs
                if job["case"] == case and job["ocr"] == condition
            ) == [1, 2, 3]
    assert len(experiment.workload("held-out", "on")) == 15


def test_failures_reduce_primary_rates_and_total_only_is_separate():
    """A failed run with plausible candidate numbers must not inflate accuracy."""
    items = [attempt("off", 1), attempt("off", 1, accepted=False)]
    total_only = attempt("off", 1)
    total_only["totalOnly"] = True
    items.append(total_only)
    result = experiment.aggregate(items)
    assert result["recall"] == 0.5
    assert result["precision"] == 0.5
    assert result["failures"] == 1
    assert result["total_passes"] == 2
    assert result["classification"] is None
    assert result["row_attempts"] == 2


def test_selection_never_uses_heldout_and_requires_both_full_conditions():
    """A held-out result cannot influence OCR selection or rescue incomplete runs."""
    items = [attempt("off", 0.8) for _ in range(33)] + [
        attempt("on", 0.9) for _ in range(33)
    ]
    assert experiment.choose_condition(items) == "on"
    items += [attempt("off", 1, stage="held-out") for _ in range(15)]
    assert experiment.choose_condition(items) == "on"
    with pytest.raises(ValueError, match="33 recorded"):
        experiment.choose_condition(items[1:])
    tied = [attempt(condition, 1) for condition in ["on", "off"] for _ in range(33)]
    assert experiment.choose_condition(tied) == "off"


def test_frozen_input_changes_block_submission(tmp_path, monkeypatch):
    """Even a same-name PDF replacement invalidates the frozen experiment."""
    root = tmp_path / "benchmarks"
    root.mkdir()
    path = tmp_path / "original.pdf"
    path.write_bytes(b"original")
    plan = {
        "hashes": {"original.pdf": experiment.file_hash(path)},
        "base_url": "unused",
        "settings": {},
    }
    monkeypatch.setattr(experiment, "ROOT", root)
    path.write_bytes(b"replacement")
    with pytest.raises(ValueError, match="Frozen input"):
        experiment.check_frozen(plan)


def test_f1_selection_does_not_reward_high_recall_with_many_wrong_rows():
    """The predeclared ranking balances recovery with precision."""
    items = [attempt("off", 0.8, precision=0.8) for _ in range(33)] + [
        attempt("on", 1, precision=0.3) for _ in range(33)
    ]
    assert experiment.choose_condition(items) == "off"


def test_second_driver_cannot_lock_the_same_experiment(tmp_path):
    """Two drivers cannot concurrently create duplicate paid jobs."""
    with experiment.experiment_lock(tmp_path):
        with pytest.raises(ValueError, match="Another driver"):
            with experiment.experiment_lock(tmp_path):
                pass
    with experiment.experiment_lock(tmp_path):
        pass


def test_local_html_escapes_document_text():
    """A malicious document label cannot become executable HTML in the report."""
    result = experiment.report_html(
        "# Test\n\n| Case | Score |\n| --- | --- |\n| <script>alert(1)</script> | 0 |"
    )
    assert "<table>" in result
    assert "<script>" not in result
    assert "&lt;script&gt;" in result


def test_poll_disconnect_resumes_same_job_without_submitting_again(monkeypatch):
    """A closed polling socket must not become a second paid extraction attempt."""
    calls, retries = [], []

    def upstream(request):
        """Drop one read, then return the completed existing job and its result."""
        calls.append((request.method, request.url.path))
        if len(calls) == 1:
            raise httpx.ReadError("connection reset", request=request)
        return httpx.Response(
            200,
            json=(
                {"result": {"saved": True}}
                if request.url.path.endswith("/result")
                else {"status": "completed"}
            ),
        )

    monkeypatch.setattr(time, "sleep", lambda _: None)
    with httpx.Client(
        base_url="http://local", transport=httpx.MockTransport(upstream)
    ) as client:
        result = wait_result(client, "same_job", 10, 1, retries.append)
    assert result["result"]["saved"] is True
    assert len(retries) == 1
    assert all(method == "GET" and "same_job" in path for method, path in calls)


def test_read_recovery_never_retries_auth_rejection():
    """Only transport and transient read errors are recoverable automatically."""
    with httpx.Client(
        base_url="http://local",
        transport=httpx.MockTransport(lambda request: httpx.Response(403)),
    ) as client:
        with pytest.raises(httpx.HTTPStatusError):
            get_job(client, "/existing", time.monotonic() + 10)


def test_distractor_parser_matches_upstream_separator_rules():
    """Keep diagnostic parsing compatible, including its deliberate unsigned tokens."""
    assert example_numbers("1,234.5; 1.234,5; 3.505.046; 1.100; -51,000") == [
        1234.5,
        1234.5,
        3505046,
        1100,
        51000,
    ]


def test_selected_report_handles_empty_or_failed_attempts(tmp_path, monkeypatch):
    """A selected plan can still render honestly when no artifacts are available."""
    monkeypatch.setattr(
        experiment,
        "read_json",
        lambda _: {
            "recorded_run": "reference",
            "recorded_report_url": "https://example.org/reference",
        },
    )
    plan = {
        "created_at": "fixed",
        "settings": {
            "model": "gpt-6.1-sol",
            "reasoning_effort": "medium",
            "mistral_ocr_model": "pinned",
        },
        "jobs": [],
        "selected_condition": "off",
        "selection_rule": "predeclared",
    }
    experiment.render(tmp_path, plan, {"comparisons": []})
    assert "OCR off" in (tmp_path / "comparison.md").read_text(encoding="utf-8")
    assert "<!doctype html>" in (tmp_path / "comparison.html").read_text(
        encoding="utf-8"
    )
