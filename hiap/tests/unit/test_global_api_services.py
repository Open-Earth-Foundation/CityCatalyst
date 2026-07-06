"""Unit tests for the shared Global API service wrappers."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest
import requests

import services.get_actions as get_actions_module
import services.get_ccra as get_ccra_module
import services.get_context as get_context_module


DEFAULT_GLOBAL_API_BASE_URL = "https://ccglobal.openearth.dev"


def _build_session_with_response(payload: object) -> tuple[Mock, Mock]:
    """Return a mock session and response pair for a successful HTTP call."""
    response = Mock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None

    session = Mock()
    session.get.return_value = response
    return session, response


@pytest.mark.unit
@pytest.mark.parametrize(
    ("module", "callable_name", "call_args", "expected_path", "payload"),
    [
        (
            get_actions_module,
            "get_actions",
            ("en",),
            "/api/v0/climate_actions?language=en",
            [{"ActionID": "ACT_001", "ActionName": "Solar", "ActionType": ["mitigation"]}],
        ),
        (
            get_context_module,
            "get_context",
            ("BR RIO",),
            "/api/v0/city_context/city/BR RIO",
            {"locode": "BR RIO", "name": "Rio de Janeiro"},
        ),
        (
            get_ccra_module,
            "get_ccra",
            ("BR RIO", "current"),
            "/api/v0/ccra/risk_assessment/city/BR RIO/current",
            [{"hazard": "floods", "keyimpact": "housing", "normalised_risk_score": 0.7}],
        ),
    ],
)
def test_service_uses_configured_global_api_base_url(
    monkeypatch: pytest.MonkeyPatch,
    module,
    callable_name: str,
    call_args: tuple[object, ...],
    expected_path: str,
    payload: object,
) -> None:
    """Each service should build its request URL from `CCGLOBAL_API_BASE_URL`."""
    monkeypatch.setenv("CCGLOBAL_API_BASE_URL", "https://api.citycatalyst.io/")
    session, _response = _build_session_with_response(payload)

    with patch.object(module.requests, "Session", return_value=session):
        result = getattr(module, callable_name)(*call_args)

    assert result == payload
    session.get.assert_called_once_with(
        f"https://api.citycatalyst.io{expected_path}",
        timeout=(10, 30),
    )
    assert session.mount.call_count == 2
    https_adapter = session.mount.call_args_list[0].args[1]
    assert https_adapter.max_retries.total == 3
    session.close.assert_called_once()


@pytest.mark.unit
@pytest.mark.parametrize(
    ("module", "callable_name", "call_args", "expected_path"),
    [
        (
            get_actions_module,
            "get_actions",
            ("en",),
            "/api/v0/climate_actions?language=en",
        ),
        (
            get_context_module,
            "get_context",
            ("BR RIO",),
            "/api/v0/city_context/city/BR RIO",
        ),
        (
            get_ccra_module,
            "get_ccra",
            ("BR RIO", "current"),
            "/api/v0/ccra/risk_assessment/city/BR RIO/current",
        ),
    ],
)
def test_service_falls_back_to_default_global_api_base_url(
    monkeypatch: pytest.MonkeyPatch,
    module,
    callable_name: str,
    call_args: tuple[object, ...],
    expected_path: str,
) -> None:
    """Each service should default to the dev Global API host when env is unset."""
    monkeypatch.delenv("CCGLOBAL_API_BASE_URL", raising=False)
    session, _response = _build_session_with_response({"ok": True})

    with patch.object(module.requests, "Session", return_value=session):
        getattr(module, callable_name)(*call_args)

    session.get.assert_called_once_with(
        f"{DEFAULT_GLOBAL_API_BASE_URL}{expected_path}",
        timeout=(10, 30),
    )


@pytest.mark.unit
@pytest.mark.parametrize(
    ("module", "callable_name", "call_args", "error"),
    [
        (
            get_actions_module,
            "get_actions",
            ("en",),
            requests.exceptions.Timeout(),
        ),
        (
            get_context_module,
            "get_context",
            ("BR RIO",),
            requests.exceptions.RequestException("boom"),
        ),
        (
            get_ccra_module,
            "get_ccra",
            ("BR RIO", "current"),
            RuntimeError("unexpected"),
        ),
    ],
)
def test_service_returns_none_on_request_failures(
    monkeypatch: pytest.MonkeyPatch,
    module,
    callable_name: str,
    call_args: tuple[object, ...],
    error: Exception,
) -> None:
    """Each service should fail closed and return `None` on request errors."""
    monkeypatch.setenv("CCGLOBAL_API_BASE_URL", "https://ccglobal.openearth.dev")
    session = Mock()
    session.get.side_effect = error

    with patch.object(module.requests, "Session", return_value=session):
        result = getattr(module, callable_name)(*call_args)

    assert result is None
    session.close.assert_called_once()
