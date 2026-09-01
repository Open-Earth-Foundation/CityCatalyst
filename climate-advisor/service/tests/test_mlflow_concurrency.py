"""Regression coverage for request-local MLflow runs without a remote backend."""

import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from app.models.requests import MessageCreateRequest
from app.utils import mlflow_logging
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.streaming_handler import StreamingHandler


@pytest.fixture
def client(monkeypatch):
    recorded = MagicMock()
    next_id = 0

    def create_run(**kwargs):
        nonlocal next_id
        next_id += 1
        return SimpleNamespace(info=SimpleNamespace(run_id=f"run-{next_id}"))

    recorded.create_run.side_effect = create_run
    recorded.log_batch.return_value = None
    monkeypatch.setattr(mlflow_logging, "initialize_mlflow", lambda: True)
    monkeypatch.setattr(mlflow_logging, "_experiment_id", lambda name: "experiment-1")
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("test_run", default=None)
    )
    # There is deliberately no fluent API on this stub.
    monkeypatch.setattr(
        mlflow_logging,
        "mlflow",
        SimpleNamespace(tracking=SimpleNamespace(MlflowClient=lambda: recorded)),
    )
    return recorded


@pytest.mark.asyncio
async def test_overlapping_requests_isolate_every_logging_operation(client, tmp_path):
    first_started = asyncio.Event()
    second_logged = asyncio.Event()
    targets = {}

    async def request(name):
        with mlflow_logging.start_run(run_name=name, experiment_name="Clima") as run:
            targets[name] = run.info.run_id
            if name == "first":
                first_started.set()
                await second_logged.wait()
            else:
                await first_started.wait()
            mlflow_logging.log_tags({"concept_note_run_id": name})
            mlflow_logging.log_params({"request": name})
            mlflow_logging.log_metrics({"count": 1})
            mlflow_logging.log_json_artifact("request.json", {"request": name})
            mlflow_logging.log_text_artifact("request.txt", name)
            mlflow_logging.log_directory_artifacts(tmp_path, artifact_path=name)
            if name == "second":
                second_logged.set()
                await asyncio.sleep(0)

    await asyncio.gather(request("first"), request("second"))

    assert len(set(targets.values())) == 2
    for name, run_id in targets.items():
        batches = [
            call.kwargs
            for call in client.log_batch.call_args_list
            if call.kwargs["run_id"] == run_id
        ]
        assert len(batches) == 3
        assert {tag.key: tag.value for tag in batches[0]["tags"]} == {
            "concept_note_run_id": name
        }
        assert {param.key: param.value for param in batches[1]["params"]} == {
            "request": name
        }
        assert batches[2]["metrics"][0].value == 1
        client.log_dict.assert_any_call(run_id, {"request": name}, "request.json")
        client.log_text.assert_any_call(run_id, name, "request.txt")
        client.log_artifacts.assert_any_call(run_id, str(tmp_path), artifact_path=name)
        client.set_terminated.assert_any_call(run_id, status="FINISHED")
    assert mlflow_logging._current_run() is None


@pytest.mark.parametrize("failure", ["initialization", "experiment", "creation"])
def test_failed_scope_never_logs_to_its_enclosing_run(client, monkeypatch, failure):
    with mlflow_logging.start_run(run_name="parent", experiment_name="Clima") as parent:
        with monkeypatch.context() as patch:
            if failure == "initialization":
                patch.setattr(mlflow_logging, "initialize_mlflow", lambda: False)
            elif failure == "experiment":
                patch.setattr(mlflow_logging, "_experiment_id", lambda name: None)
            else:
                patch.setattr(
                    client, "create_run", MagicMock(side_effect=RuntimeError("offline"))
                )
            with mlflow_logging.start_run(
                run_name="failed", experiment_name="Clima"
            ) as failed:
                assert failed is None
                mlflow_logging.log_tags({"concept_note_run_id": "wrong"})
                mlflow_logging.log_params({"wrong": "parameter"})
                mlflow_logging.log_metrics({"wrong": 1})
                mlflow_logging.log_json_artifact("wrong.json", {})
                mlflow_logging.log_text_artifact("wrong.txt", "wrong")
        client.log_batch.assert_not_called()
        client.log_dict.assert_not_called()
        client.log_text.assert_not_called()
        mlflow_logging.log_tags({"concept_note_run_id": "parent"})
        assert client.log_batch.call_args.kwargs["run_id"] == parent.info.run_id


def test_nested_run_has_explicit_parent_and_restores_parent(client):
    with mlflow_logging.start_run(run_name="parent", experiment_name="Clima") as parent:
        with mlflow_logging.start_run(
            run_name="child", experiment_name="Clima", nested=True
        ) as child:
            assert (
                client.create_run.call_args.kwargs["tags"]["mlflow.parentRunId"]
                == parent.info.run_id
            )
            mlflow_logging.log_tags({"target": "child"})
            assert client.log_batch.call_args.kwargs["run_id"] == child.info.run_id
        mlflow_logging.log_tags({"target": "parent"})
        assert client.log_batch.call_args.kwargs["run_id"] == parent.info.run_id
    mlflow_logging.log_tags({"target": "outside"})
    assert client.log_batch.call_count == 2


@pytest.mark.asyncio
async def test_cancelled_request_closes_only_its_run(client):
    started = asyncio.Event()

    async def request():
        with mlflow_logging.start_run(run_name="cancelled", experiment_name="Clima"):
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


@pytest.mark.asyncio
async def test_inherited_child_cannot_log_after_request_closes(client):
    release_child = asyncio.Event()

    async def delayed_log():
        await release_child.wait()
        mlflow_logging.log_tags({"late": "data"})

    with mlflow_logging.start_run(run_name="request", experiment_name="Clima"):
        task = asyncio.create_task(delayed_log())
    release_child.set()
    await task
    client.log_batch.assert_not_called()


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


def test_trace_metadata_uses_request_run_and_mlflow_32_arguments(client, monkeypatch):
    recorded = {}

    def update_trace(tags=None, metadata=None, client_request_id=None):
        recorded.update(metadata)

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(
        mlflow_logging.mlflow,
        "get_current_active_span",
        lambda: object(),
        raising=False,
    )
    monkeypatch.setattr(
        mlflow_logging.mlflow, "update_current_trace", update_trace, raising=False
    )
    with mlflow_logging.start_run(run_name="request", experiment_name="Clima") as run:
        assert mlflow_logging.update_current_trace_context(
            session_id="thread-1", user_id="user-1"
        )
        assert recorded == {
            "mlflow.sourceRun": run.info.run_id,
            "mlflow.trace.session": "thread-1",
            "mlflow.trace.user": "user-1",
        }


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
        with mlflow_logging.start_run(
            run_name=name, experiment_name="isolated-test"
        ) as run:
            assert run is not None
            assert mlflow.active_run() is None
            with mlflow_logging.start_trace_span(name=name, span_type="CHAIN") as span:
                assert span is not None
                if name == "first":
                    started.set()
                    await release.wait()
                else:
                    await started.wait()
                    release.set()
                mlflow_logging.log_tags({"concept_note_run_id": name})
                mlflow_logging.log_params({"request": name})
                mlflow_logging.log_metrics({"count": 1})
                mlflow_logging.log_json_artifact(f"{name}.json", {"request": name})
                assert mlflow_logging.update_current_trace_context(session_id=name)
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
            assert [artifact.path for artifact in client.list_artifacts(run_id)] == [
                f"{name}.json"
            ]
            trace = client.get_trace(trace_id)
            assert trace.info.trace_metadata["mlflow.sourceRun"] == run_id
            assert trace.info.trace_metadata["mlflow.trace.session"] == name
            assert (
                trace.info.trace_location.mlflow_experiment.experiment_id
                == experiment_id
            )
    finally:
        mlflow.tracing.reset()
        mlflow.set_tracking_uri(previous_uri)


@pytest.mark.parametrize("stationary_energy", [False, True])
@pytest.mark.asyncio
async def test_other_chat_modes_link_traces_before_model_start(
    monkeypatch, stationary_energy
):
    recorded = {}
    active = False
    handler = StreamingHandler(
        thread_id=uuid4(), user_id="user-1", session_factory=None
    )
    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=str(uuid4()) if stationary_energy else None
    )

    @contextmanager
    def span_context(**kwargs):
        nonlocal active
        active = True
        recorded["span"] = kwargs
        try:
            yield object()
        finally:
            active = False

    def update_context(**kwargs):
        assert active
        recorded["updated"] = True
        return True

    class Result:
        async def stream_events(self):
            yield SimpleNamespace(type="agent_updated_stream_event")

    def run_streamed(*args, **kwargs):
        assert active
        assert recorded["updated"]
        return Result()

    monkeypatch.setattr("app.utils.streaming_handler.start_trace_span", span_context)
    monkeypatch.setattr(
        "app.utils.streaming_handler.update_current_trace_context", update_context
    )
    monkeypatch.setattr("app.utils.streaming_handler.Runner.run_streamed", run_streamed)
    payload = MessageCreateRequest(user_id="user-1", content="Review the context")
    assert [
        chunk async for chunk in handler._stream_agent_events(object(), payload, [])
    ] == []
    assert recorded["span"]["name"] == handler.workflow_context.trace_workflow_name
