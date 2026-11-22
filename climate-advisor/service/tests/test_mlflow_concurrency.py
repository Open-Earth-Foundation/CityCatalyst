"""Regression coverage for request-local MLflow runs, failures, and cancellation."""

import asyncio
from contextvars import ContextVar
from threading import Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from anyio import CancelScope

from app.utils import mlflow_logging
from app.utils.cnb_observability import record_edit_outcome


@pytest.fixture
def client(mlflow_client):
    return mlflow_client


@pytest.mark.asyncio
async def test_async_edit_telemetry_forwards_operation_keyword(client):
    await mlflow_logging.run_mlflow_io(
        record_edit_outcome,
        run_id=uuid4(),
        operation="apply",
        outcome="failed",
    )

    assert client.create_run.call_args.kwargs["tags"]["operation"] == "apply"
    client.set_terminated.assert_called_once_with("run-1", status="FINISHED")


@pytest.mark.asyncio
async def test_cancelled_request_closes_only_its_run(client):
    started = asyncio.Event()

    async def request():
        async with mlflow_logging.async_start_run(
            run_name="cancelled", experiment_name="Clima"
        ):
            started.set()
            await asyncio.Event().wait()

    with mlflow_logging.start_run(run_name="parent", experiment_name="Clima") as parent:
        task = asyncio.create_task(request())
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert mlflow_logging._current_run().run_id == parent.info.run_id
        assert "mlflow.parentRunId" not in client.create_run.call_args.kwargs["tags"]
    client.set_terminated.assert_any_call("run-2", status="FAILED")
    client.set_terminated.assert_any_call("run-1", status="FINISHED")


def test_pending_writes_are_drained_before_termination(client, monkeypatch):
    events = []
    operation = SimpleNamespace(wait=lambda: events.append("write"))
    client.log_batch.return_value = operation
    client.set_terminated.side_effect = lambda *args, **kwargs: events.append("close")
    monkeypatch.setenv("MLFLOW_ASYNC_LOGGING_ENABLED", "true")
    with mlflow_logging.start_run(run_name="request", experiment_name="Clima"):
        mlflow_logging.log_tags({"tag": "value"})
    assert client.log_batch.call_args.kwargs["synchronous"] is False
    assert events == ["write", "close"]


def test_logging_and_close_failures_do_not_mask_application_exception(client):
    client.log_batch.side_effect = RuntimeError("logging offline")
    client.set_terminated.side_effect = RuntimeError("close offline")
    with (
        pytest.raises(ValueError, match="application failed"),
        mlflow_logging.start_run(run_name="request", experiment_name="Clima"),
    ):
        mlflow_logging.log_tags({"tag": "value"})
        raise ValueError("application failed")
    assert mlflow_logging._current_run() is None


@pytest.mark.parametrize("async_logging", ["true", "false"])
@pytest.mark.asyncio
async def test_real_mlflow_persists_isolated_runs_and_trace_links(
    tmp_path, monkeypatch, async_logging
):
    import mlflow

    previous_uri = mlflow.get_tracking_uri()
    uri = "sqlite:///" + (tmp_path / "tracking.db").as_posix()
    monkeypatch.setenv("MLFLOW_TRACKING_URI", uri)
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "isolated-test")
    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_ASYNC_LOGGING_ENABLED", async_logging)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_LAST_INITIALIZATION_FAILURE_AT", None)
    monkeypatch.setattr(mlflow_logging, "_EXPERIMENT_IDS", {})
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("integration_run", default=None)
    )
    monkeypatch.setattr(mlflow.openai, "autolog", lambda: None)
    mlflow.set_tracking_uri(uri)
    client = mlflow.tracking.MlflowClient()
    experiment_id = client.create_experiment(
        "isolated-test", artifact_location=tmp_path.as_uri()
    )
    mlflow.tracing.reset()
    started = asyncio.Event()
    release = asyncio.Event()

    async def request(name):
        source_directory = tmp_path / f"{name}-sources"
        source_directory.mkdir()
        (source_directory / "source.md").write_text("# Source", encoding="utf-8")
        async with mlflow_logging.async_start_run(
            run_name=name, experiment_name="isolated-test"
        ) as run:
            assert run is not None
            assert mlflow.active_run() is None
            with mlflow_logging.start_trace_span(name=name, span_type="CHAIN") as span:
                assert span is not None
                # Interleave both requests so every write races the other run.
                if name == "first":
                    started.set()
                    await release.wait()
                else:
                    await started.wait()
                    release.set()
                mlflow_logging.log_tags({"concept_note_run_id": name})
                mlflow_logging.log_params({"request": name})
                mlflow_logging.log_metrics({"count": 1})
                mlflow_logging.log_json_artifact(
                    f"{name}.json", {"request": name, "access_token": "secret"}
                )
                mlflow_logging.log_text_artifact(f"{name}.txt", name)
                mlflow_logging.log_directory_artifacts(
                    source_directory, artifact_path=f"{name}-sources"
                )
                assert mlflow_logging.update_current_trace_context(
                    session_id=name, user_id="user-1"
                )
                return name, run.info.run_id, span.trace_id

    try:
        results = await asyncio.gather(request("first"), request("second"))
        mlflow.flush_trace_async_logging()
        for name, run_id, trace_id in results:
            run = client.get_run(run_id)
            assert run.info.status == "FINISHED"
            assert run.data.tags["concept_note_run_id"] == name
            assert run.data.params["request"] == name
            assert run.data.metrics["count"] == 1
            assert {artifact.path for artifact in client.list_artifacts(run_id)} == {
                f"{name}.json",
                f"{name}.txt",
                f"{name}-sources",
            }
            assert mlflow.artifacts.load_dict(f"runs:/{run_id}/{name}.json") == {
                "request": name,
                "access_token": mlflow_logging.REDACTED_VALUE,
            }
            trace = client.get_trace(trace_id)
            assert trace.info.trace_metadata["mlflow.sourceRun"] == run_id
            assert trace.info.trace_metadata["mlflow.trace.session"] == name
            assert trace.info.trace_metadata["mlflow.trace.user"] == "user-1"
            assert (
                trace.info.trace_location.mlflow_experiment.experiment_id
                == experiment_id
            )
    finally:
        mlflow.tracing.reset()
        mlflow.set_tracking_uri(previous_uri)


@pytest.mark.parametrize("phase", ["create", "write", "close"])
@pytest.mark.parametrize("cancellation", ["task", "scope", "repeated_task"])
async def test_cancellation_waits_for_inflight_telemetry_before_closing(
    client, phase, cancellation
):
    entered = Event()
    release = Event()
    order = []
    scopes = []
    started = asyncio.Event()

    def blocked(*args, **kwargs):
        entered.set()
        release.wait(timeout=3)
        order.append(phase)
        return SimpleNamespace(info=SimpleNamespace(run_id="cancelled-run"))

    client.set_terminated.side_effect = lambda *args, **kwargs: order.append("close")
    operation = {
        "create": client.create_run,
        "write": client.log_dict,
        "close": client.set_terminated,
    }[phase]
    operation.side_effect = blocked

    async def request():
        with CancelScope() as scope:
            scopes.append(scope)
            async with mlflow_logging.async_start_run(
                run_name="request", experiment_name="Clima"
            ):
                await mlflow_logging.run_mlflow_io(
                    mlflow_logging.log_json_artifact, "request.json", {}
                )
                if phase == "close":
                    started.set()
                    await asyncio.Event().wait()

    task = asyncio.create_task(request())
    try:
        if phase == "close":
            await asyncio.wait_for(started.wait(), timeout=2)
            task.cancel()  # Enter termination with the run already marked FAILED.
        assert await asyncio.to_thread(entered.wait, 2)
        if cancellation == "scope":
            scopes[0].cancel()
        else:
            task.cancel()
        await asyncio.sleep(0.01)
        if cancellation == "repeated_task":
            for _ in range(3):
                task.cancel()
                await asyncio.sleep(0.01)
        assert not task.done()
        if phase != "close":
            client.set_terminated.assert_not_called()
    finally:
        release.set()
        if cancellation == "scope" and phase != "close":
            await asyncio.wait_for(task, timeout=2)
        else:
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, timeout=2)
    assert order == (["close"] if phase == "close" else [phase, "close"])
    client.set_terminated.assert_called_once()
    assert client.set_terminated.call_args.kwargs["status"] == "FAILED"
    assert mlflow_logging._current_run() is None
