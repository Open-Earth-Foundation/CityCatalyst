"""Source-only semantic repair checks and three-round issue accounting."""

from extractor.ghgi import SCHEMA_ID, consistency_issues, changed_fields
from extractor.jobs import JobController
from test_jobs import FakeAgent
from test_service import run


def test_gross_removals_and_combined_scope_are_reviewed_without_expected_answers():
    """Retain removal values; repair inclusion/scope semantics without guessing."""
    data = {
        "total_kind": "gross",
        "reported_removals_tco2e": -10,
        "rows": [
            {
                "row_role": "removal",
                "emissions_tco2e": -10,
                "total_inclusion": "included",
                "scope_basis": "combined",
                "scope": 1,
                "notation_key": None,
            }
        ],
    }
    issues = consistency_issues(data, {"$id": SCHEMA_ID})
    assert any("gross" in issue for issue in issues)
    assert any("combined-scope" in issue for issue in issues)
    data["rows"][0].update(total_inclusion="excluded", scope=None)
    assert consistency_issues(data, {"$id": SCHEMA_ID}) == []
    assert data["rows"][0]["emissions_tco2e"] == -10
    assert consistency_issues(data, {"$id": "some-other-user-schema"}) == []


def test_net_accepts_removals_and_never_derives_unreported_totals():
    """A valid net boundary includes signed removals without demanding printed sums."""
    data = {
        "total_kind": "net",
        "reported_removals_tco2e": None,
        "rows": [
            {
                "row_role": "removal",
                "emissions_tco2e": -10,
                "total_inclusion": "included",
                "scope_basis": "inferred",
                "scope": 1,
                "notation_key": None,
            }
        ],
    }
    assert consistency_issues(data, {"$id": SCHEMA_ID}) == []
    assert data["reported_removals_tco2e"] is None


def test_changed_paths_keep_null_and_missing_distinct():
    """Repair traces identify changed values and deleted leaves using escaped paths."""
    assert changed_fields({"data": {"a/b": None, "x": 0}}, {"data": {"a/b": 1}}) == [
        "/a~1b",
        "/x",
    ]


def test_reconciliation_uses_source_precision_without_changing_values():
    """Arithmetic feedback uses the printed target and source-based tolerance."""
    data = {
        "total_kind": "net",
        "reported_total_tco2e": 90,
        "reconciliation_tolerance_tco2e": 0.5,
        "rows": [
            {
                "row_role": "emission",
                "emissions_tco2e": 100,
                "total_inclusion": "included",
            },
            {
                "row_role": "removal",
                "emissions_tco2e": -9,
                "total_inclusion": "included",
            },
        ],
    }
    assert any(
        "differs from printed" in value
        for value in consistency_issues(data, {"$id": SCHEMA_ID})
    )
    assert data["rows"][1]["emissions_tco2e"] == -9
    data["rows"][1]["emissions_tco2e"] = -10
    assert consistency_issues(data, {"$id": SCHEMA_ID}) == []


def test_three_repairs_preserve_each_round_and_remaining_issues():
    """Stop after four validated turns, retaining explicit unresolved feedback."""

    async def scenario():
        """Advance a fake agent independently through the configured repair cap."""
        agent = FakeAgent()
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_trace", True, 3)
        for index in range(4):
            agent.turn_id = f"turn_{index}"
            await jobs.step(jobs.get("sess_trace"))
        job = jobs.get("sess_trace")
        assert job["repairs"] == 3
        assert len(agent.sent) == 3
        assert [item["round"] for item in job["rounds"]] == [0, 1, 2, 3]
        assert job["repair_still_needed"] is True
        assert job["remaining_issue_count"] == 1
        assert job["rounds"][1]["persisting_issue_keys"] == ["schema:/value"]
        assert "candidate" not in jobs.snapshot(job)["rounds"][0]
        await jobs.step(job)
        assert len(jobs.get("sess_trace")["rounds"]) == 4
        await jobs.close()

    run(scenario())


def test_successful_repair_records_issue_resolution():
    """A clean follow-up explicitly resolves prior issues and stops early."""

    async def scenario():
        """Switch off the independently simulated schema problem after one turn."""
        agent = FakeAgent()
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_trace", True, 3)
        await jobs.step(jobs.get("sess_trace"))
        agent.issues = False
        agent.turn_id = "repaired"
        await jobs.step(jobs.get("sess_trace"))
        job = jobs.get("sess_trace")
        assert job["repair_still_needed"] is False
        assert job["repairs"] == 1
        assert job["rounds"][-1]["resolved_issue_keys"] == ["schema:/value"]
        await jobs.close()

    run(scenario())
