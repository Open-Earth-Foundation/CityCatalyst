"""Exercise bounded repair, durable recovery, cancellation, and public debug data."""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from extractor.api import create_app
from extractor.jobs import JobController
from extractor.provider import CandidateError, ProviderError
from test_service import AUTH, SETTINGS, adapter, candidate, pdf, run, session


class FakeAgent:
    """Simulate a hosted session with explicit turn progression and repair sends."""

    def __init__(self, issues=True, malformed=False, field_status="found"):
        """Keep remote behavior independently controllable by each scenario."""
        self.turn_id = "turn_1"
        self.status = "completed"
        self.issues = issues
        self.malformed = malformed
        self.field_status = field_status
        self.sent = []
        self.cancelled = 0
        self.fail_send = False
        self.session_status = "idle"

    async def inspect(self, job_id):
        """Return the latest hosted root turn without advancing it implicitly."""
        return (
            session(self.session_status),
            {"id": self.turn_id, "status": self.status},
            self.status,
        )

    async def result(self, job_id):
        """Return schema feedback or simulate an invalid artifact contract."""
        if self.malformed:
            raise CandidateError(502, "fields/0: missing source evidence")
        data = candidate()
        data["fields"][0]["status"] = self.field_status
        return {
            "job_id": job_id,
            "result": data,
            "validation": {
                "warnings": [],
                "data_schema_errors": (
                    ["/value: expected number"] if self.issues else []
                ),
            },
        }

    async def repair(self, job_id, key, message):
        """Record logical repair sends, optionally losing the acknowledgement."""
        self.sent.append((job_id, key, message))
        if self.fail_send:
            raise ProviderError(504, "timeout", uncertain=True)

    async def cancel(self, job_id):
        """Record stop requests separately from simulated execution completion."""
        self.cancelled += 1


@pytest.mark.parametrize("auto_repair", [False, True])
def test_flag_mode_and_successful_repair(auto_repair):
    """Only opt-in sends follow-up turns; each new result is checked again."""

    async def scenario():
        """Run the controller without background polling delays."""
        agent = FakeAgent()
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", auto_repair, 2)
        await jobs.step(jobs.get("sess_test"))
        job = jobs.get("sess_test")
        assert job["repairs"] == int(auto_repair)
        if auto_repair:
            assert job["status"] == "repairing"
            assert "expected number" in agent.sent[0][2]
            agent.turn_id = "turn_2"
            agent.issues = False
            await jobs.step(jobs.get("sess_test"))
            job = jobs.get("sess_test")
            assert job["repair_outcome"] == "checks_passed"
        else:
            assert not agent.sent
            assert job["repair_outcome"] == "issues_flagged"
        assert job["status"] == "completed"
        assert len([e for e in job["history"] if e["type"] == "validation"]) == 1 + int(
            auto_repair
        )
        await jobs.close()

    run(scenario())


def test_limit_preserves_unresolved_candidate():
    """Unfixable feedback stops at the configured limit and remains reviewable."""

    async def scenario():
        """Simulate two unsuccessful repairs and the final validation."""
        agent = FakeAgent()
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", True, 2)
        for index in range(3):
            agent.turn_id = f"turn_{index}"
            await jobs.step(jobs.get("sess_test"))
        job = jobs.get("sess_test")
        assert job["status"] == "completed"
        assert job["repair_outcome"] == "limit_reached"
        assert job["result"] and job["issues"]
        assert len(agent.sent) == 2
        await jobs.step(job)
        assert len(agent.sent) == 2
        await jobs.close()

    run(scenario())


def test_invalid_artifact_is_repaired_without_treating_api_errors_as_candidate_errors():
    """Contract failures trigger repair; transport failures do not consume attempts."""

    async def scenario():
        """Check malformed output feedback and a separate upstream outage."""
        agent = FakeAgent(malformed=True)
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", True, 1)
        await jobs.step(jobs.get("sess_test"))
        assert "missing source evidence" in agent.sent[0][2]
        agent.turn_id = "turn_2"
        agent.malformed = False
        agent.issues = False
        await jobs.step(jobs.get("sess_test"))
        assert jobs.get("sess_test")["repair_outcome"] == "checks_passed"
        await jobs.close()

    run(scenario())


@pytest.mark.parametrize(
    "field_status,repairs",
    [
        ("ambiguous", 1),
        ("unreadable", 1),
        ("not_searched", 1),
        ("not_found_after_search", 0),
        ("found", 0),
    ],
)
def test_only_revisitable_field_outcomes_trigger_repair(field_status, repairs):
    """Honest absence after search is not automatically forced into a value."""

    async def scenario():
        """Evaluate field outcomes independently from schema errors."""
        agent = FakeAgent(issues=False, field_status=field_status)
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", True, 1)
        await jobs.step(jobs.get("sess_test"))
        assert jobs.get("sess_test")["repairs"] == repairs
        await jobs.close()

    run(scenario())


def test_restart_reuses_exact_pending_message_and_idempotency_key(tmp_path):
    """A crash after acceptance must not create a second logical repair turn."""

    async def scenario():
        """Restart from SQLite after an uncertain repair acknowledgement."""
        path = str(tmp_path / "jobs.sqlite3")
        agent = FakeAgent()
        agent.fail_send = True
        jobs = JobController(agent, path)
        jobs.register("sess_test", True, 2)
        with pytest.raises(ProviderError):
            await jobs.step(jobs.get("sess_test"))
        await jobs.close()
        restarted = JobController(agent, path)
        agent.fail_send = False
        await restarted.step(restarted.get("sess_test"))
        assert agent.sent[0] == agent.sent[1]
        assert restarted.get("sess_test")["repairs"] == 1
        agent.turn_id = "turn_2"
        agent.issues = False
        await restarted.step(restarted.get("sess_test"))
        assert restarted.get("sess_test")["status"] == "completed"
        await restarted.close()

    run(scenario())


def test_cancel_waits_for_an_accepted_repair_to_settle():
    """Stop requests survive the interval before the new root turn appears."""

    async def scenario():
        """Cancel while the previous completed turn is still the newest visible."""
        agent = FakeAgent()
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", True, 2)
        await jobs.step(jobs.get("sess_test"))
        agent.session_status = "in_progress"
        await jobs.cancel("sess_test")
        await jobs.step(jobs.get("sess_test"))
        assert jobs.get("sess_test")["status"] == "cancellation_requested"
        agent.turn_id = "turn_2"
        agent.status = "cancelled"
        await jobs.step(jobs.get("sess_test"))
        assert jobs.get("sess_test")["status"] == "cancelled"
        assert len(agent.sent) == 1
        await jobs.close()

    run(scenario())


def test_cancel_uncertain_unsent_repair_can_finish_when_remote_is_idle():
    """Cancellation must not wait forever if an uncertain repair was never accepted."""

    async def scenario():
        """Keep the previous terminal turn visible after cancellation."""
        agent = FakeAgent()
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", True, 2)
        await jobs.step(jobs.get("sess_test"))
        await jobs.cancel("sess_test")
        await jobs.step(jobs.get("sess_test"))
        assert jobs.get("sess_test")["status"] == "cancelled"
        assert len(agent.sent) == 1
        await jobs.close()

    run(scenario())


def test_background_recovery_finishes_without_frontend_polling(tmp_path):
    """A restarted API controller validates saved work without a status request."""

    async def scenario():
        """Recover an unfinished snapshot and await the actual worker task."""
        agent = FakeAgent(issues=False)
        path = str(tmp_path / "jobs.sqlite3")
        jobs = JobController(agent, path)
        jobs.register("sess_test", True, 2)
        await jobs.close()
        restarted = JobController(agent, path)
        restarted.recover()
        await asyncio.wait_for(restarted.tasks["sess_test"], timeout=7)
        assert restarted.get("sess_test")["repair_outcome"] == "checks_passed"
        await restarted.close()

    run(scenario())


def test_transport_failure_during_validation_does_not_spend_repair_turn():
    """An artifact-download outage is not feedback about a candidate's quality."""

    async def scenario():
        """Substitute a failing download while keeping remote completion intact."""
        agent = FakeAgent()

        async def failed_result(job_id):
            """Simulate a retryable upstream read failure."""
            raise ProviderError(502, "network error", uncertain=True)

        agent.result = failed_result
        jobs = JobController(agent, ":memory:")
        jobs.register("sess_test", True, 2)
        with pytest.raises(ProviderError):
            await jobs.step(jobs.get("sess_test"))
        assert not agent.sent
        assert jobs.get("sess_test")["repairs"] == 0
        await jobs.close()

    run(scenario())


def test_repair_wire_contract_uses_same_session_and_idempotency_header():
    """Verify the actual REST continuation contract, independently of controller mocks."""

    def upstream(request):
        """Inspect the sole continuation message and its stable request key."""
        import json

        assert request.method == "POST"
        assert request.url.path == "/v1/agents/sessions/sess_test/events"
        assert request.headers["Idempotency-Key"] == "repair-key"
        event = json.loads(request.content)["events"][0]
        assert event == {
            "type": "agent.session.input.message",
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Feedback"}],
                }
            ],
        }
        return httpx.Response(202)

    run(adapter(upstream).repair("sess_test", "repair-key", "Feedback"))


def test_accepted_continuation_blocks_deletion_before_new_turn_appears():
    """An old terminal turn cannot make an actively continuing session deletable."""

    def upstream(request):
        """Expose an in-progress session with only its previous completed turn."""
        assert request.method == "GET"
        if request.url.path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": [{"id": "old", "status": "completed", "subagent_id": None}],
                    "has_more": False,
                },
            )
        return httpx.Response(200, json=session("in_progress"))

    with pytest.raises(ProviderError) as error:
        run(adapter(upstream).delete("sess_test"))
    assert error.value.status == 409


def test_activity_filters_private_items_and_bounds_output():
    """Debug endpoints expose public execution records with short source text."""

    def upstream(request):
        """Supply mixed public and private item types."""
        if request.url.path.endswith("/items"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "secret",
                            "type": "reasoning",
                            "text": "private reasoning",
                        },
                        {
                            "id": "cmd",
                            "type": "command_execution",
                            "turn_id": "turn_1",
                            "command": "pdftotext city.pdf -",
                            "status": "completed",
                            "exit_code": 0,
                            "output": "x" * 10000,
                        },
                        {
                            "id": "msg",
                            "type": "message",
                            "role": "assistant",
                            "content": [
                                {"type": "output_text", "text": "Checking page 3"}
                            ],
                        },
                        {
                            "id": "user",
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": "private user prompt"}
                            ],
                        },
                    ],
                    "has_more": True,
                },
            )
        return httpx.Response(200, json=session())

    with TestClient(create_app(SETTINGS, adapter(upstream))) as client:
        assert client.get("/v1/extractions/sess_test/activity").status_code == 401
        response = client.get("/v1/extractions/sess_test/activity", headers=AUTH)
        data = response.json()
        assert {item["id"] for item in data["items"]} == {"cmd", "msg"}
        assert (
            len(next(item for item in data["items"] if item["id"] == "cmd")["output"])
            == 6000
        )
        assert data["has_older_items"]


def test_repair_options_and_reviewable_invalid_result_through_http():
    """The API accepts bounded options and returns issues even without valid JSON."""

    def upstream(request):
        """Accept uploads; use direct controller stepping for deterministic checks."""
        return httpx.Response(
            200,
            json=(
                {"id": "sess_test"}
                if request.url.path == "/v1/agents/sessions"
                else {"id": "file_test"}
            ),
        )

    app = create_app(SETTINGS, adapter(upstream))
    with TestClient(app) as client:
        for limit in [0, 6]:
            response = client.post(
                "/v1/extractions",
                headers=AUTH,
                data={"max_repairs": str(limit)},
                files={"city_pdf": ("a.pdf", pdf()), "taxonomy_pdf": ("b.pdf", pdf())},
            )
            assert response.status_code == 422
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"auto_repair": "false", "max_repairs": "3"},
            files={"city_pdf": ("a.pdf", pdf()), "taxonomy_pdf": ("b.pdf", pdf())},
        )
        assert response.status_code == 202
        assert (
            client.get("/v1/extractions/sess_test/result", headers=AUTH).status_code
            == 409
        )
        jobs = app.state.jobs
        jobs.provider = FakeAgent(malformed=True)
        client.portal.call(jobs.step, client.portal.call(jobs.get, "sess_test"))
        data = client.get("/v1/extractions/sess_test/result", headers=AUTH).json()
        assert data["result"] is None
        assert data["repair"]["issues"]
        progress = client.get("/v1/extractions/sess_test", headers=AUTH).json()
        assert "pending" not in progress and "result" not in progress
        assert progress["status"] == "completed"
