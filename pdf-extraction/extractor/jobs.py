"""Persist local validation/repair control and run bounded loops without a browser.

Run one API worker per state file. SQLite stores controller state and candidate
results; OpenAI keeps the actual agent session. Stable repair keys allow recovery
after a crash between message acceptance and local acknowledgement.
"""

import asyncio
import hashlib
import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from extractor.provider import AgentsProvider, CandidateError, ProviderError
from extractor.ghgi import repair_issues, changed_fields

LOGGER = logging.getLogger(__name__)
TERMINAL = {"completed", "failed", "cancelled", "needs_input", "repair_error"}


class JobController:
    """Own one background task per job and persist each repair before sending it."""

    def __init__(self, provider: AgentsProvider, state_path: str):
        """Open the local journal; callers must close it on server shutdown."""
        self.provider = provider
        if state_path != ":memory:":
            Path(state_path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(state_path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL)"
        )
        self.db.commit()
        self.tasks = {}
        self.locks = {}

    def get(self, job_id: str) -> dict | None:
        """Read the last durable controller snapshot, without remote mutations."""
        row = self.db.execute(
            "SELECT body FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, job: dict) -> None:
        """Commit a snapshot before any follow-up message may be sent."""
        self.db.execute(
            "INSERT OR REPLACE INTO jobs VALUES (?, ?)",
            (job["job_id"], json.dumps(job)),
        )
        self.db.commit()

    def event(self, job: dict, kind: str, message: str, **details) -> None:
        """Append a timestamped controller decision with bounded retained history."""
        job["history"].append(
            {
                "time": datetime.now(timezone.utc).isoformat(),
                "type": kind,
                "message": message,
                **details,
            }
        )
        job["history"] = job["history"][-100:]

    def register(
        self,
        job_id: str,
        auto_repair: bool,
        max_repairs: int,
        benchmark_case: str | None = None,
        preprocessing: dict | None = None,
    ) -> None:
        """Persist options immediately after hosted session acceptance."""
        job = {
            "job_id": job_id,
            "status": "queued",
            "auto_repair": auto_repair,
            "max_repairs": max_repairs,
            "repairs": 0,
            "history": [],
            "issues": [],
            "result": None,
            "pending": None,
            "checked_turn": None,
            "cancel_requested": False,
            "benchmark_case": benchmark_case,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "rounds": [],
            "preprocessing": preprocessing or {},
        }
        self.event(job, "submitted", "Hosted agent accepted the extraction.")
        self.save(job)
        self.watch(job_id)

    def watch(self, job_id: str) -> None:
        """Ensure a saved nonterminal job has one local runner."""
        task = self.tasks.get(job_id)
        if task is None or task.done():
            self.tasks[job_id] = asyncio.create_task(self.run(job_id))

    def recover(self) -> None:
        """Restart loops from durable state after an API process restart."""
        for (job_id,) in self.db.execute("SELECT id FROM jobs").fetchall():
            if self.get(job_id)["status"] not in TERMINAL:
                self.watch(job_id)

    async def run(self, job_id: str) -> None:
        """Poll independently of the UI; preserve uncertain sends for reconciliation."""
        await asyncio.sleep(1)
        while True:
            try:
                async with self.locks.setdefault(job_id, asyncio.Lock()):
                    job = self.get(job_id)
                    if not job or job["status"] in TERMINAL:
                        return
                    await self.step(job)
            except ProviderError as exc:
                job = self.get(job_id)
                if not job:
                    return
                job["error"] = exc.detail
                if exc.status == 404:
                    job["status"] = "failed"
                elif exc.upstream_status in {400, 401, 403, 422}:
                    job["status"] = "repair_error"
                elif (
                    job.get("pending")
                    and not exc.uncertain
                    and exc.status not in {409, 429}
                ):
                    job["status"] = "repair_error"
                self.event(job, "upstream_error", exc.detail)
                self.save(job)
            except Exception:
                LOGGER.exception("Controller failed for job %s", job_id)
                job = self.get(job_id)
                if job:
                    job["status"] = "repair_error"
                    self.event(
                        job,
                        "controller_error",
                        "Local controller failed; inspect server logs.",
                    )
                    self.save(job)
                return
            await asyncio.sleep(3)

    async def step(self, job: dict) -> None:
        """Inspect execution, validate each new completed turn, then repair or finish."""
        job_id = job["job_id"]
        session, turn, status = await self.provider.inspect(job_id)
        job["usage"] = session.get("usage")
        job["turn_id"] = turn["id"] if turn else None
        job["required_action_types"] = [
            a.get("type") for a in session.get("required_actions", [])
        ]
        job.pop("error", None)
        if job["cancel_requested"]:
            awaiting_repair_turn = (
                job.get("pending")
                and (not turn or turn["id"] == job["pending"]["previous_turn_id"])
                and session.get("status") not in {"idle", "failed"}
            )
            if (
                status not in {"completed", "failed", "cancelled"}
                or awaiting_repair_turn
            ):
                await self.provider.cancel(job_id)
                job["status"] = "cancellation_requested"
            else:
                job["status"] = "cancelled"
                self.event(
                    job, "cancelled", "Execution stopped; further repair is disabled."
                )
            self.save(job)
            return
        if status in {"failed", "cancelled", "needs_input"}:
            job["status"] = status
            self.event(
                job,
                status,
                "Agent execution stopped: " + status,
                turn_id=job["turn_id"],
            )
            self.save(job)
            return
        pending = job.get("pending")
        if pending:
            if turn and turn["id"] != pending["previous_turn_id"]:
                job["pending"] = None
                self.event(
                    job,
                    "repair_started",
                    "A new agent turn is processing repair feedback.",
                    turn_id=turn["id"],
                    attempt=job["repairs"],
                )
            else:
                # Exactly the same persisted key and body are reused after a timeout/crash.
                await self.provider.repair(job_id, pending["key"], pending["message"])
                job["status"] = "repairing"
                self.save(job)
                return
        if status != "completed":
            if job["status"] != status:
                self.event(
                    job, status, "Agent execution: " + status, turn_id=job["turn_id"]
                )
            job["status"] = status
            self.save(job)
            return
        if job["checked_turn"] == turn["id"]:
            return
        job["status"] = "validating"
        self.event(
            job,
            "validating",
            "Checking result structure, schema, page bounds, field outcomes, and reported coverage.",
            turn_id=turn["id"],
        )
        self.save(job)
        envelope = None
        try:
            envelope = await self.provider.result(job_id)
            details = repair_issues(envelope)
        except CandidateError as exc:
            details = [
                {
                    "category": "contract",
                    "field_id": None,
                    "message": exc.detail,
                    "key": "contract:" + exc.detail,
                }
            ]
        previous = job.get("rounds", [])[-1] if job.get("rounds") else None
        previous_keys = (
            {issue["key"] for issue in previous["issue_details"]} if previous else set()
        )
        current_keys = {issue["key"] for issue in details}
        job.setdefault("rounds", []).append(
            {
                "round": job["repairs"],
                "turn_id": turn["id"],
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "turn_created_at": turn.get("created_at"),
                "usage": turn.get("usage"),
                "issue_details": details,
                "resolved_issue_keys": sorted(previous_keys - current_keys),
                "new_issue_keys": sorted(current_keys - previous_keys),
                "persisting_issue_keys": sorted(current_keys & previous_keys),
                "changed_data_paths": (
                    changed_fields(
                        previous.get("candidate") if previous else None,
                        envelope.get("result") if envelope else None,
                    )
                    if previous
                    else []
                ),
                "candidate": envelope.get("result") if envelope else None,
            }
        )
        issues = [issue["message"] for issue in details]
        job.update(issues=issues[:100], result=envelope, checked_turn=turn["id"])
        self.event(
            job,
            "validation",
            (
                "Validation found issues."
                if issues
                else "Automated checks passed; source accuracy still needs human review."
            ),
            issues=job["issues"],
            resolved_issue_count=len(previous_keys - current_keys),
            new_issue_count=len(current_keys - previous_keys),
            changed_data_paths=job["rounds"][-1]["changed_data_paths"],
            attempt=job["repairs"],
            turn_id=turn["id"],
        )
        if issues and job["auto_repair"] and job["repairs"] < job["max_repairs"]:
            job["repairs"] += 1
            feedback = {
                "attempt": job["repairs"],
                "max_repairs": job["max_repairs"],
                "previous_turn_id": turn["id"],
                "issues": [i[:2000] for i in job["issues"]],
            }
            prompt = (
                Path(__file__)
                .with_name("prompts")
                .joinpath("repair.md")
                .read_text(encoding="utf-8")
            )
            job["pending"] = {
                "key": "repair-"
                + hashlib.sha256(f"{job_id}:{turn['id']}".encode()).hexdigest(),
                "previous_turn_id": turn["id"],
                "message": prompt + "\n" + json.dumps(feedback),
            }
            job["status"] = "repairing"
            self.event(
                job,
                "repair_queued",
                "Sending validation feedback to the same agent session.",
                attempt=job["repairs"],
            )
            self.save(job)
            await self.provider.repair(
                job_id, job["pending"]["key"], job["pending"]["message"]
            )
            return
        job["status"] = "completed"
        job["repair_still_needed"] = bool(details)
        job["remaining_issue_count"] = len(details)
        job["finished_at"] = datetime.now(timezone.utc).isoformat()
        job["repair_outcome"] = (
            "limit_reached"
            if issues and job["auto_repair"]
            else "issues_flagged" if issues else "checks_passed"
        )
        self.event(
            job,
            "finished",
            (
                "Repair limit reached; review remaining issues."
                if job["repair_outcome"] == "limit_reached"
                else "Finished; candidate data requires source review."
            ),
        )
        self.save(job)

    def snapshot(self, job: dict) -> dict:
        """Return controller progress without copying candidate data into every poll."""
        snapshot = {
            key: value
            for key, value in job.items()
            if key not in {"result", "pending", "checked_turn", "rounds"}
        }
        snapshot["rounds"] = [
            {key: value for key, value in item.items() if key != "candidate"}
            for item in job.get("rounds", [])
        ]
        return snapshot

    async def cancel(self, job_id: str) -> None:
        """Persist cancellation before cancelling the remote turn; prevent new repairs."""
        async with self.locks.setdefault(job_id, asyncio.Lock()):
            job = self.get(job_id)
            if job:
                job["cancel_requested"] = True
                job["status"] = "cancellation_requested"
                self.event(
                    job,
                    "cancel_requested",
                    "Stop requested; no further repair turns will be submitted.",
                )
                self.save(job)
            await self.provider.cancel(job_id)
            if job:
                self.watch(job_id)

    async def delete(self, job_id: str) -> list[str]:
        """Serialize deletion with cancellation and remove the local candidate journal."""
        async with self.locks.setdefault(job_id, asyncio.Lock()):
            job = self.get(job_id)
            if job and job["status"] not in TERMINAL:
                raise ProviderError(
                    409,
                    "Cancel the job and wait for the controller to stop before deleting it.",
                )
            pending = await self.provider.delete(job_id)
            self.db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            self.db.commit()
            return pending

    async def close(self) -> None:
        """Stop local runners without cancelling hosted work, then close SQLite."""
        for task in self.tasks.values():
            task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.db.close()
