"""Best-effort MLflow run, artifact, and OpenAI trace logging helpers."""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Iterator, Mapping

try:
    import mlflow
except ImportError:
    mlflow = None


logger = logging.getLogger(__name__)

DEFAULT_MLFLOW_TRACKING_URI = "https://mlflow-dev.openearth.dev"
DEFAULT_MLFLOW_EXPERIMENT_NAME = "hiap-meed"
MLFLOW_INIT_RETRY_COOLDOWN_SECONDS = 60.0

_INITIALIZED = False
_LAST_INITIALIZATION_FAILURE_AT: float | None = None


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
    experiment_name = os.getenv(
        "MLFLOW_EXPERIMENT_NAME", DEFAULT_MLFLOW_EXPERIMENT_NAME
    ).strip()
    try:
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment(experiment_name)
        mlflow.config.enable_async_logging(is_async_logging_enabled())
        mlflow.openai.autolog()
    except Exception as error:
        logger.warning(
            "MLflow not running or unavailable tracking_uri=%s experiment=%s error=%s",
            tracking_uri,
            experiment_name,
            error,
        )
        _INITIALIZED = False
        _LAST_INITIALIZATION_FAILURE_AT = now
        return False

    _INITIALIZED = True
    _LAST_INITIALIZATION_FAILURE_AT = None
    logger.info(
        "MLflow initialized tracking_uri=%s experiment=%s",
        tracking_uri,
        experiment_name,
    )
    return True


@contextmanager
def start_run(
    *,
    run_name: str,
    tags: Mapping[str, object] | None = None,
    params: Mapping[str, object] | None = None,
    nested: bool = False,
) -> Iterator[Any | None]:
    """Start one MLflow run if available, otherwise yield a no-op context."""
    if not initialize_mlflow():
        yield None
        return
    if mlflow is None:
        yield None
        return

    try:
        run_context = mlflow.start_run(run_name=run_name, nested=nested)
        run = run_context.__enter__()
    except Exception as error:
        logger.warning(
            "MLflow not running or unavailable while starting run run_name=%s nested=%s error=%s",
            run_name,
            nested,
            error,
        )
        yield None
        return

    exit_exception_type = None
    exit_exception = None
    exit_traceback = None
    try:
        if tags:
            log_tags(tags)
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
                "MLflow not running or unavailable while closing run run_name=%s nested=%s error=%s",
                run_name,
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
                key: value
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


def log_json_artifact(artifact_file: str, payload: Mapping[str, object]) -> None:
    """Best-effort log one JSON artifact to the active MLflow run."""
    if not _has_active_run():
        return
    try:
        mlflow.log_dict(dict(payload), artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow JSON artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )


def log_text_artifact(artifact_file: str, content: str) -> None:
    """Best-effort log one text artifact to the active MLflow run."""
    if not _has_active_run():
        return
    try:
        mlflow.log_text(content, artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow text artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )
