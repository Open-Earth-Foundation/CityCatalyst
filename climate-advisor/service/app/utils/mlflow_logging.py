"""Best-effort MLflow run, artifact, and OpenAI trace logging helpers."""

from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import Mapping, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Iterator
from uuid import UUID

try:
    import mlflow
    from mlflow.entities import Metric, Param, RunTag
except ImportError:
    mlflow = None


logger = logging.getLogger(__name__)

DEFAULT_MLFLOW_TRACKING_URI = "https://mlflow-dev.openearth.dev"
DEFAULT_CLIMATE_ADVISOR_EXPERIMENT_NAME = "Clima"
DEFAULT_MLFLOW_RUN_USER = "climate-advisor"
MLFLOW_INIT_RETRY_COOLDOWN_SECONDS = 60.0
REDACTED_VALUE = "[REDACTED]"

_SENSITIVE_KEY_PARTS = (
    "access_token",
    "refresh_token",
    "authorization",
    "api_key",
    "apikey",
    "client_secret",
    "secret",
    "password",
    "bearer",
    "jwt",
)
_JWT_PATTERN = re.compile(
    r"\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{6,}\b"
)
_SECRET_PATTERN = re.compile(r"\b(?:sk|lsv2)-[A-Za-z0-9_-]{8,}\b")

_INITIALIZED = False
_LAST_INITIALIZATION_FAILURE_AT: float | None = None
_EXPERIMENT_IDS: dict[str, str] = {}


@dataclass
class _RunContext:
    """Task-local logging target, shared only with work spawned by that task."""

    client: Any
    run_id: str
    pending_operations: list[Any] = field(default_factory=list)
    closed: bool = False


_RUN_CONTEXT: ContextVar[_RunContext | None] = ContextVar(
    "mlflow_run_context", default=None
)


def climate_advisor_experiment_name() -> str:
    """Return the configured MLflow experiment for all Climate Advisor runs."""
    return (
        os.getenv(
            "MLFLOW_EXPERIMENT_NAME",
            DEFAULT_CLIMATE_ADVISOR_EXPERIMENT_NAME,
        ).strip()
        or DEFAULT_CLIMATE_ADVISOR_EXPERIMENT_NAME
    )


def mlflow_environment_tag() -> str:
    """Return the environment tag attached to Climate Advisor MLflow runs."""
    return os.getenv("MLFLOW_ENVIRONMENT", "dev").strip() or "dev"


def mlflow_run_user() -> str:
    """Return the service identity shown in MLflow's Created by field."""
    return (
        os.getenv("MLFLOW_RUN_USER", DEFAULT_MLFLOW_RUN_USER).strip()
        or DEFAULT_MLFLOW_RUN_USER
    )


def is_async_logging_enabled() -> bool:
    """Return whether async logging is enabled for supported MLflow fluent APIs."""
    return os.getenv("MLFLOW_ASYNC_LOGGING_ENABLED", "true").strip().lower() == "true"


def is_mlflow_enabled() -> bool:
    """Return whether MLflow logging is enabled by env var."""
    return os.getenv("MLFLOW_ENABLED", "false").strip().lower() == "true"


def _current_run() -> _RunContext | None:
    """Return this task's open logging target, never another task's fluent run."""
    context = _RUN_CONTEXT.get()
    return context if context is not None and not context.closed else None


def _install_live_span_set_tag_compatibility() -> None:
    """Add MLflow LiveSpan.set_tag when the installed MLflow build lacks it."""
    if mlflow is None:
        return
    try:
        from mlflow.entities import LiveSpan
    except Exception:
        return

    if hasattr(LiveSpan, "set_tag") or not hasattr(LiveSpan, "set_attribute"):
        return

    def set_tag(self: Any, key: str, value: Any) -> None:
        self.set_attribute(key, value)

    setattr(LiveSpan, "set_tag", set_tag)


def initialize_mlflow() -> bool:
    """Initialize MLflow tracking and OpenAI autologging with retry cooldown."""
    global _INITIALIZED, _LAST_INITIALIZATION_FAILURE_AT

    if not is_mlflow_enabled():
        _INITIALIZED = False
        _LAST_INITIALIZATION_FAILURE_AT = None
        return False
    if _INITIALIZED:
        return True
    if mlflow is None:
        logger.warning("MLflow is not installed; skipping MLflow initialization")
        _INITIALIZED = False
        return False

    # Avoid spamming retries and warnings while MLflow is temporarily unavailable.
    now = time.monotonic()
    if (
        _LAST_INITIALIZATION_FAILURE_AT is not None
        and now - _LAST_INITIALIZATION_FAILURE_AT < MLFLOW_INIT_RETRY_COOLDOWN_SECONDS
    ):
        return False

    tracking_uri = os.getenv("MLFLOW_TRACKING_URI", DEFAULT_MLFLOW_TRACKING_URI).strip()
    try:
        mlflow.set_tracking_uri(tracking_uri)
        # All CA traces share one configured experiment; never switch it per request.
        experiment = mlflow.set_experiment(climate_advisor_experiment_name())
        _EXPERIMENT_IDS[experiment.name] = str(experiment.experiment_id)
        mlflow.config.enable_async_logging(is_async_logging_enabled())
        _install_live_span_set_tag_compatibility()
        mlflow.openai.autolog()
    except Exception as error:
        logger.warning(
            "MLflow not running or unavailable tracking_uri=%s error=%s",
            tracking_uri,
            error,
        )
        _INITIALIZED = False
        _LAST_INITIALIZATION_FAILURE_AT = now
        return False

    _INITIALIZED = True
    _LAST_INITIALIZATION_FAILURE_AT = None
    logger.info("MLflow initialized tracking_uri=%s", tracking_uri)
    return True


def _experiment_id(experiment_name: str) -> str | None:
    """Return an experiment id, creating the experiment when the backend permits it."""
    if mlflow is None:
        return None
    cached_id = _EXPERIMENT_IDS.get(experiment_name)
    if cached_id:
        return cached_id

    try:
        client = mlflow.tracking.MlflowClient()
        experiment = client.get_experiment_by_name(experiment_name)
        experiment_id = (
            experiment.experiment_id
            if experiment is not None
            else client.create_experiment(experiment_name)
        )
    except Exception as error:
        logger.warning(
            "MLflow experiment unavailable experiment=%s error=%s",
            experiment_name,
            error,
        )
        return None

    _EXPERIMENT_IDS[experiment_name] = str(experiment_id)
    return str(experiment_id)


@contextmanager
def start_run(
    *,
    run_name: str,
    experiment_name: str,
    tags: Mapping[str, object] | None = None,
    params: Mapping[str, object] | None = None,
    nested: bool = False,
) -> Iterator[Any | None]:
    """Create an explicit run isolated across awaits; failures disable only this scope.

    Child tasks may log to the request while it is open. Nested runs get an
    explicit parent tag; independent requests never use MLflow's fluent stack.
    Pending writes are drained and the run is terminated on exit, including
    cancellation, before restoring the enclosing task's logging target.
    """
    parent = _current_run()
    token = _RUN_CONTEXT.set(None)
    context = None
    status = "FINISHED"
    try:
        # Mask an inherited target even if initialization or run creation fails.
        if not initialize_mlflow() or mlflow is None:
            yield None
            return
        experiment_id = _experiment_id(experiment_name)
        if experiment_id is None:
            yield None
            return
        try:
            client = mlflow.tracking.MlflowClient()
            run_tags = {
                "mlflow.user": mlflow_run_user(),
                "service": "climate-advisor",
                "environment": mlflow_environment_tag(),
                **dict(tags or {}),
            }
            if nested and parent is not None:
                run_tags["mlflow.parentRunId"] = parent.run_id
            run = client.create_run(
                experiment_id=experiment_id,
                run_name=run_name,
                tags=_string_map(run_tags),
            )
        except Exception as error:
            logger.warning(
                "MLflow run start failed run_name=%s experiment=%s error=%s",
                run_name,
                experiment_name,
                error,
            )
            yield None
            return

        context = _RunContext(client=client, run_id=run.info.run_id)
        _RUN_CONTEXT.set(context)
        if params:
            log_params(params)
        yield run
    except BaseException:
        status = "FAILED"
        raise
    finally:
        # Inherited child contexts must not write to a request after it closes.
        if context is not None:
            context.closed = True
            for operation in context.pending_operations:
                try:
                    operation.wait()
                except Exception as error:
                    logger.warning(
                        "MLflow pending write failed run_id=%s error=%s",
                        context.run_id,
                        error,
                    )
            try:
                context.client.set_terminated(context.run_id, status=status)
            except Exception as error:
                logger.warning(
                    "MLflow run close failed run_id=%s error=%s", context.run_id, error
                )
        _RUN_CONTEXT.reset(token)


@contextmanager
def start_trace_span(
    *,
    name: str,
    span_type: str,
    inputs: object | None = None,
    attributes: Mapping[str, object] | None = None,
) -> Iterator[Any | None]:
    """Start one best-effort MLflow span inside the active trace context."""
    if not _INITIALIZED or mlflow is None:
        yield None
        return

    span_factory = getattr(mlflow, "start_span", None)
    if not callable(span_factory):
        yield None
        return

    try:
        span_context = span_factory(
            name=name,
            span_type=span_type,
            attributes=_json_safe(attributes or {}),
        )
        span = span_context.__enter__()
    except Exception as error:
        logger.warning("MLflow span start failed name=%s error=%s", name, error)
        yield None
        return

    if inputs is not None:
        _set_span_value(span, "set_inputs", inputs, name=name)
    if _current_run() is not None:
        update_current_trace_context()

    exit_exception_type = None
    exit_exception = None
    exit_traceback = None
    try:
        yield span
    except BaseException as error:
        exit_exception_type = type(error)
        exit_exception = error
        exit_traceback = error.__traceback__
        raise
    finally:
        try:
            span_context.__exit__(
                exit_exception_type,
                exit_exception,
                exit_traceback,
            )
        except Exception as error:
            logger.warning("MLflow span close failed name=%s error=%s", name, error)


def set_span_outputs(span: object | None, outputs: object) -> None:
    """Attach redacted outputs to an active best-effort MLflow span."""
    if span is None:
        return
    _set_span_value(span, "set_outputs", outputs, name="active")


def log_tags(tags: Mapping[str, object]) -> None:
    """Best-effort log tags to this task's explicit run."""
    _log_batch(tags=tags)


def update_current_trace_context(
    *,
    session_id: object | None = None,
    user_id: object | None = None,
    client_request_id: object | None = None,
    tags: Mapping[str, object] | None = None,
    metadata: Mapping[str, object] | None = None,
) -> bool:
    """Attach session and request context to the current active MLflow trace."""
    if not _INITIALIZED or mlflow is None:
        return False

    # Avoid the warning MLflow emits when no trace span is active yet.
    active_span_getter = getattr(mlflow, "get_current_active_span", None)
    if callable(active_span_getter):
        try:
            if active_span_getter() is None:
                return False
        except Exception as error:
            logger.warning("MLflow active trace lookup failed error=%s", error)
            return False

    update_trace = getattr(mlflow, "update_current_trace", None)
    if not callable(update_trace):
        return False

    # Use the metadata contract supported by the pinned MLflow 3.2 runtime.
    trace_metadata = _string_map(metadata or {})
    if session_id is not None:
        trace_metadata["mlflow.trace.session"] = str(session_id)
    if user_id is not None:
        trace_metadata["mlflow.trace.user"] = str(user_id)
    if context := _current_run():
        trace_metadata["mlflow.sourceRun"] = context.run_id
    try:
        update_trace(
            tags=_string_map(tags or {}) or None,
            metadata=trace_metadata or None,
            client_request_id=_optional_string(client_request_id),
        )
        return True
    except Exception as error:
        logger.warning("MLflow current trace update failed error=%s", error)
        return False


def log_params(params: Mapping[str, object]) -> None:
    """Best-effort log parameters to this task's explicit run."""
    _log_batch(params=params)


def log_metrics(metrics: Mapping[str, float | int]) -> None:
    """Best-effort log numeric metrics to this task's explicit run."""
    _log_batch(metrics=metrics)


def _log_batch(
    *,
    tags: Mapping[str, object] | None = None,
    params: Mapping[str, object] | None = None,
    metrics: Mapping[str, float | int] | None = None,
) -> None:
    """Normalize a batch and retain its pending write for request-scoped draining."""
    context = _current_run()
    if context is None or not (tags or params or metrics):
        return
    try:
        timestamp = int(time.time() * 1000)
        operation = context.client.log_batch(
            run_id=context.run_id,
            tags=[RunTag(key, value) for key, value in _string_map(tags or {}).items()],
            params=[
                Param(key, str(_param_value(value)))
                for key, value in (params or {}).items()
                if value is not None and str(value).strip()
            ],
            metrics=[
                Metric(key, float(value), timestamp, step=0)
                for key, value in (metrics or {}).items()
                if isinstance(value, int | float)
            ],
            synchronous=not is_async_logging_enabled(),
        )
        if operation is not None:
            context.pending_operations.append(operation)
    except Exception as error:
        logger.warning(
            "MLflow batch logging failed run_id=%s error=%s", context.run_id, error
        )


def log_json_artifact(artifact_file: str, payload: Any) -> None:
    """Best-effort log one redacted JSON artifact to this task's explicit run."""
    context = _current_run()
    if context is None:
        return
    try:
        context.client.log_dict(context.run_id, _json_safe(payload), artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow JSON artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )


def log_text_artifact(artifact_file: str, content: str) -> None:
    """Best-effort log one redacted text artifact to this task's explicit run."""
    context = _current_run()
    if context is None:
        return
    try:
        context.client.log_text(context.run_id, _redact_text(content), artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow text artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )


def log_directory_artifacts(
    local_directory: Path,
    *,
    artifact_path: str,
) -> None:
    """Best-effort upload an exact local artifact directory to this task's run."""
    context = _current_run()
    if context is None or not local_directory.is_dir():
        return
    try:
        context.client.log_artifacts(
            context.run_id, str(local_directory), artifact_path=artifact_path
        )
    except Exception as error:
        logger.warning(
            "MLflow directory artifact logging failed local_directory=%s artifact_path=%s error=%s",
            local_directory,
            artifact_path,
            error,
        )


def redact_payload(payload: Any) -> Any:
    """Return a JSON-safe copy of a payload with secrets redacted."""
    return _json_safe(payload)


def _set_span_value(
    span: object,
    method_name: str,
    value: object,
    *,
    name: str,
) -> None:
    """Set redacted span data without allowing observability to break runtime work."""
    method = getattr(span, method_name, None)
    if not callable(method):
        return
    try:
        method(_json_safe(value))
    except Exception as error:
        logger.warning(
            "MLflow span data logging failed name=%s method=%s error=%s",
            name,
            method_name,
            error,
        )


def _param_value(value: object) -> object:
    """Normalize MLflow param values without treating token counts as secrets."""
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, int | float | bool):
        return value
    return str(_json_safe(value))


def _optional_string(value: object | None) -> str | None:
    """Return a non-empty string for optional MLflow trace context fields."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _string_map(values: Mapping[str, object]) -> dict[str, str]:
    """Return non-empty string values suitable for MLflow tags and metadata."""
    return {
        key: text
        for key, value in values.items()
        if (text := _optional_string(value)) is not None
    }


def _json_safe(value: Any, *, key: str | None = None) -> Any:
    """Convert arbitrary values to JSON-safe, redacted objects."""
    if key is not None and _is_sensitive_key(key):
        return REDACTED_VALUE
    if hasattr(value, "model_dump"):
        try:
            return _json_safe(value.model_dump(mode="json"))
        except TypeError:
            return _json_safe(value.model_dump())
    if isinstance(value, Mapping):
        return {
            str(item_key): _json_safe(item_value, key=str(item_key))
            for item_key, item_value in value.items()
        }
    if isinstance(value, str):
        return _redact_text(value)
    if value is None or isinstance(value, int | float | bool):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Enum):
        return _json_safe(value.value)
    if isinstance(value, Sequence) and not isinstance(value, bytes | bytearray):
        return [_json_safe(item) for item in value]
    if isinstance(value, bytes | bytearray):
        return f"<{len(value)} bytes>"
    return str(value)


def _is_sensitive_key(key: str) -> bool:
    """Return whether a JSON key usually contains credentials or bearer tokens."""
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def _redact_text(value: str) -> str:
    """Redact common secret forms inside free-form text."""
    stripped = value.strip()
    if stripped.lower().startswith("bearer "):
        return "Bearer " + REDACTED_VALUE
    redacted = _JWT_PATTERN.sub(REDACTED_VALUE, value)
    return _SECRET_PATTERN.sub(REDACTED_VALUE, redacted)
