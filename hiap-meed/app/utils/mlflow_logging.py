"""Best-effort MLflow run, artifact, and OpenAI trace logging helpers."""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator, Mapping

try:
    import mlflow
except ImportError:
    mlflow = None


logger = logging.getLogger(__name__)

DEFAULT_MLFLOW_TRACKING_URI = "https://mlflow-dev.openearth.dev"
DEFAULT_MLFLOW_EXPERIMENT_NAME = "hiap-meed"

_INITIALIZED = False
_INITIALIZATION_ATTEMPTED = False

def is_mlflow_enabled() -> bool:
    """Return whether MLflow logging is enabled by env var."""
    return os.getenv("MLFLOW_ENABLED", "false").strip().lower() == "true"


def initialize_mlflow() -> bool:
    """Initialize MLflow tracking and OpenAI autologging once per process."""
    global _INITIALIZED, _INITIALIZATION_ATTEMPTED

    if not is_mlflow_enabled():
        _INITIALIZATION_ATTEMPTED = True
        _INITIALIZED = False
        return False
    if _INITIALIZED:
        return True
    if _INITIALIZATION_ATTEMPTED:
        return False

    _INITIALIZATION_ATTEMPTED = True
    tracking_uri = os.getenv(
        "MLFLOW_TRACKING_URI", DEFAULT_MLFLOW_TRACKING_URI
    ).strip()
    experiment_name = os.getenv(
        "MLFLOW_EXPERIMENT_NAME", DEFAULT_MLFLOW_EXPERIMENT_NAME
    ).strip()
    if mlflow is None:
        logger.warning("MLflow is not installed; skipping MLflow initialization")
        _INITIALIZED = False
        return False
    try:
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment(experiment_name)
        mlflow.openai.autolog()
    except Exception as error:
        logger.warning(
            "MLflow not running or unavailable tracking_uri=%s experiment=%s error=%s",
            tracking_uri,
            experiment_name,
            error,
        )
        _INITIALIZED = False
        return False

    _INITIALIZED = True
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
    if not _INITIALIZED or mlflow is None or not tags:
        return
    try:
        mlflow.set_tags(
            {
                key: str(value)
                for key, value in tags.items()
                if value is not None and str(value).strip()
            }
        )
    except Exception as error:
        logger.warning("MLflow tag logging failed error=%s", error)


def log_params(params: Mapping[str, object]) -> None:
    """Best-effort log MLflow params for the active run."""
    if not _INITIALIZED or mlflow is None or not params:
        return
    try:
        mlflow.log_params(
            {
                key: value
                for key, value in params.items()
                if value is not None and str(value).strip()
            }
        )
    except Exception as error:
        logger.warning("MLflow param logging failed error=%s", error)


def log_metrics(metrics: Mapping[str, float | int]) -> None:
    """Best-effort log numeric metrics for the active MLflow run."""
    if not _INITIALIZED or mlflow is None or not metrics:
        return
    try:
        mlflow.log_metrics(
            {
                key: float(value)
                for key, value in metrics.items()
                if isinstance(value, int | float)
            }
        )
    except Exception as error:
        logger.warning("MLflow metric logging failed error=%s", error)


def log_json_artifact(artifact_file: str, payload: Mapping[str, object]) -> None:
    """Best-effort log one JSON artifact to the active MLflow run."""
    if not _INITIALIZED or mlflow is None:
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
    if not _INITIALIZED or mlflow is None:
        return
    try:
        mlflow.log_text(content, artifact_file)
    except Exception as error:
        logger.warning(
            "MLflow text artifact logging failed artifact_file=%s error=%s",
            artifact_file,
            error,
        )
