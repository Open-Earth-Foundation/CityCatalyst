"""Best-effort MLflow run, artifact, and OpenAI trace logging helpers."""

from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import Mapping, Sequence
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Iterator
from uuid import UUID

try:
    import mlflow
except ImportError:
    mlflow = None


logger = logging.getLogger(__name__)

DEFAULT_MLFLOW_TRACKING_URI = "https://mlflow-dev.openearth.dev"
DEFAULT_GENERAL_EXPERIMENT_NAME = "clima"
DEFAULT_AGENTIC_EXPERIMENT_NAME = "agentic-flow"
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


def general_experiment_name() -> str:
    """Return the configured MLflow experiment for general Climate Advisor chat."""
    return (
        os.getenv(
            "MLFLOW_EXPERIMENT_NAME",
            os.getenv("MLFLOW_GENERAL_EXPERIMENT_NAME", DEFAULT_GENERAL_EXPERIMENT_NAME),
        )
        .strip()
        or DEFAULT_GENERAL_EXPERIMENT_NAME
    )


def agentic_experiment_name() -> str:
    """Return the configured MLflow experiment for agentic Climate Advisor flows."""
    return (
        os.getenv("MLFLOW_AGENTIC_EXPERIMENT_NAME", DEFAULT_AGENTIC_EXPERIMENT_NAME)
        .strip()
        or DEFAULT_AGENTIC_EXPERIMENT_NAME
    )


def mlflow_environment_tag() -> str:
    """Return the environment tag attached to Climate Advisor MLflow runs."""
    return os.getenv("MLFLOW_ENVIRONMENT", "dev").strip() or "dev"


def mlflow_run_user() -> str:
    """Return the service identity shown in MLflow's Created by field."""
    return os.getenv("MLFLOW_RUN_USER", DEFAULT_MLFLOW_RUN_USER).strip() or DEFAULT_MLFLOW_RUN_USER


def is_async_logging_enabled() -> bool:
    """Return whether async logging is enabled for supported MLflow fluent APIs."""
    return os.getenv("MLFLOW_ASYNC_LOGGING_ENABLED", "true").strip().lower() == "true"


def is_mlflow_enabled() -> bool:
    """Return whether MLflow logging is enabled by env var."""
    return os.getenv("MLFLOW_ENABLED", "false").strip().lower() == "true"


def _has_active_run() -> bool:
    """Return whether MLflow currently has one explicit active run."""
    if not _INITIALIZED or mlflow is None:
        return False
    try:
        return mlflow.active_run() is not None
    except Exception:
        return False


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
        and now - _LAST_INITIALIZATION_FAILURE_AT
        < MLFLOW_INIT_RETRY_COOLDOWN_SECONDS
    ):
        return False

    tracking_uri = os.getenv(
        "MLFLOW_TRACKING_URI", DEFAULT_MLFLOW_TRACKING_URI
    ).strip()
    try:
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.config.enable_async_logging(is_async_logging_enabled())
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
    """Start one MLflow run if available, otherwise yield a no-op context."""
    if not initialize_mlflow() or mlflow is None:
        yield None
        return

    experiment_id = _experiment_id(experiment_name)
    if experiment_id is None:
        yield None
        return

    try:
        run_context = mlflow.start_run(
            run_name=run_name,
            experiment_id=experiment_id,
            nested=nested,
        )
        run = run_context.__enter__()
    except Exception as error:
        logger.warning(
            "MLflow not running or unavailable while starting run run_name=%s experiment=%s nested=%s error=%s",
            run_name,
            experiment_name,
            nested,
            error,
        )
        yield None
        return

    exit_exception_type = None
    exit_exception = None
    exit_traceback = None
    try:
        baseline_tags = {
            "mlflow.user": mlflow_run_user(),
            "service": "climate-advisor",
            "environment": mlflow_environment_tag(),
        }
        log_tags({**baseline_tags, **dict(tags or {})})
        if params:
            log_params(params)
        yield run
    except Exception as error:
        exit_exception_type = type(error)
        exit_exception = error
        exit_traceback = error.__traceback__
        raise
    finally:
        try:
            run_context.__exit__(
                exit_exception_type,
                exit_exception,
                exit_traceback,
            )
        except Exception as error:
            logger.warning(
                "MLflow not running or unavailable while closing run run_name=%s experiment=%s nested=%s error=%s",
                run_name,
                experiment_name,
                nested,
                error,
            )


def log_tags(tags: Mapping[str, object]) -> None:
    """Best-effort log run tags for the active MLflow run."""
    if not _has_active_run() or not tags:
        return
    try:
        mlflow.set_tags(
            {
                key: str(value)
                for key, value in tags.items()
                if value is not None and str(value).strip()
            },
            synchronous=not is_async_logging_enabled(),
        )
    except Exception as error:
        logger.warning("MLflow tag logging failed error=%s", error)


def log_params(params: Mapping[str, object]) -> None:
    """Best-effort log MLflow params for the active run."""
    if not _has_active_run() or not params:
        return
    try:
        mlflow.log_params(
            {
                key: _param_value(value)
                for key, value in params.items()
                if value is not None and str(value).strip()
            },
            synchronous=not is_async_logging_enabled(),
        )
    except Exception as error:
        logger.warning("MLflow param logging failed error=%s", error)


def log_metrics(metrics: Mapping[str, float | int]) -> None:
    """Best-effort log numeric metrics for the active MLflow run."""
    if not _has_active_run() or not metrics:
        return
    try:
        mlflow.log_metrics(
            {
                key: float(value)
                for key, value in metrics.items()
                if isinstance(value, int | float)
            },
            synchronous=not is_async_logging_enabled(),
        )
    except Exception as error:
        logger.warning("MLflow metric logging failed error=%s", error)


def log_json_artifact(artifact_file: str, payload: Any) -> None:
    """Best-effort log one redacted JSON artifact to the active MLflow run."""
    if not _has_active_run():
        return
    try:
        mlflow.log_dict(_json_safe(payload), artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow JSON artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )


def log_text_artifact(artifact_file: str, content: str) -> None:
    """Best-effort log one redacted text artifact to the active MLflow run."""
    if not _has_active_run():
        return
    try:
        mlflow.log_text(_redact_text(content), artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow text artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )


def redact_payload(payload: Any) -> Any:
    """Return a JSON-safe copy of a payload with secrets redacted."""
    return _json_safe(payload)


def _param_value(value: object) -> object:
    """Normalize MLflow param values without treating token counts as secrets."""
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, int | float | bool):
        return value
    return str(_json_safe(value))


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
        return {str(item_key): _json_safe(item_value, key=str(item_key)) for item_key, item_value in value.items()}
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
