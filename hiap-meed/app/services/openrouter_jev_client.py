"""OpenRouter Decisions API adapter for release-time Jev classification.

Kept separate from the OpenAI chat client: Jev returns a typed Choice answer,
not generative prose. Report-serving code must never import or call this module.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

from app.config.llm_settings import get_llm_settings
from app.modules.prioritizer.authority_scope import (
    AUTHORITY_SCOPE_CHOICE_CRITERIA,
    AUTHORITY_SCOPE_RUBRIC_VERSION,
    is_semantic_authority_scope_label,
)

logger = logging.getLogger(__name__)

OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"
AUTHORITY_SCOPE_QUESTION_ID = "authority_scope"
DEFAULT_JEV_MODEL_ID = "typesafe/jev-1.13"


class OpenRouterJevError(RuntimeError):
    """Raised when OpenRouter/Jev authentication, transport, or payload fails."""


def get_openrouter_api_key() -> str:
    """Return the configured OpenRouter API key or raise."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if api_key is None or not api_key.strip():
        raise OpenRouterJevError("OPENROUTER_API_KEY must be set for Jev classification")
    return api_key.strip()


def get_jev_model_id() -> str:
    """Return the pinned OpenRouter Jev model id from llm_config.yaml."""
    settings = get_llm_settings()
    model_id = settings.jev.model_id.strip()
    return model_id or DEFAULT_JEV_MODEL_ID


def get_jev_confidence_threshold() -> float:
    """Return the configured acceptance threshold for Jev Choice confidence."""
    return float(get_llm_settings().jev.confidence_threshold)


def get_jev_timeout_seconds() -> float:
    """Return the configured Jev HTTP timeout."""
    return float(get_llm_settings().jev.timeout_seconds)


def get_jev_max_retries() -> int:
    """Return the configured Jev retry count."""
    return int(get_llm_settings().jev.max_retries)


def build_authority_scope_decisions_request(
    *,
    classifier_input: dict[str, Any],
    model_id: str | None = None,
) -> dict[str, Any]:
    """Build one OpenRouter Decisions request for authority-scope Choice."""
    return {
        "model": model_id or get_jev_model_id(),
        "state": {
            "legal_row": classifier_input,
            "rubric_version": AUTHORITY_SCOPE_RUBRIC_VERSION,
            "label_definitions": AUTHORITY_SCOPE_CHOICE_CRITERIA,
        },
        "questions": {
            AUTHORITY_SCOPE_QUESTION_ID: {
                "type": "choice",
                "instructions": (
                    "Using only `legal_row` and `label_definitions`, choose the "
                    "single best authority-scope label for this legal assessment. "
                    "Do not invent facts beyond the provided fields. Prefer "
                    "`unclassified` when the row is contradictory or insufficient."
                ),
                "criteria": AUTHORITY_SCOPE_CHOICE_CRITERIA,
            }
        },
    }


def parse_authority_scope_choice_answer(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize one Choice answer from the Decisions API."""
    answers = payload.get("answers")
    if not isinstance(answers, dict):
        raise OpenRouterJevError("Jev response missing answers object")
    answer = answers.get(AUTHORITY_SCOPE_QUESTION_ID)
    if not isinstance(answer, dict):
        raise OpenRouterJevError("Jev response missing authority_scope answer")
    if answer.get("type") != "choice":
        raise OpenRouterJevError("Jev authority_scope answer is not a choice")
    selected = answer.get("choice")
    if not is_semantic_authority_scope_label(selected):
        raise OpenRouterJevError(f"Jev returned unknown authority_scope label: {selected!r}")
    probabilities_raw = answer.get("probabilities")
    if not isinstance(probabilities_raw, dict):
        raise OpenRouterJevError("Jev choice answer missing probabilities")
    probabilities: dict[str, float] = {}
    for label in AUTHORITY_SCOPE_CHOICE_CRITERIA:
        value = probabilities_raw.get(label)
        if not isinstance(value, (int, float)):
            raise OpenRouterJevError(
                f"Jev probabilities missing numeric value for {label}"
            )
        probabilities[label] = float(value)
    confidence = answer.get("confidence")
    if not isinstance(confidence, (int, float)):
        raise OpenRouterJevError("Jev choice answer missing confidence")
    return {
        "selected_label": selected,
        "probabilities": probabilities,
        "chosen_label_probability": probabilities[str(selected)],
        "confidence": float(confidence),
        "response_model": payload.get("model"),
        "provider": payload.get("provider"),
        "usage": payload.get("usage") or {},
        "response_id": payload.get("id"),
    }


class OpenRouterJevClient:
    """Small HTTP client for OpenRouter's alpha Decisions API."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else get_jev_timeout_seconds()
        )
        self._max_retries = (
            max_retries if max_retries is not None else get_jev_max_retries()
        )
        self._http_client = http_client

    def _headers(self) -> dict[str, str]:
        api_key = self._api_key or get_openrouter_api_key()
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Open-Earth-Foundation/CityCatalyst",
            "X-Title": "hiap-meed-authority-scope",
        }

    def classify_authority_scope(
        self,
        *,
        classifier_input: dict[str, Any],
        model_id: str | None = None,
    ) -> dict[str, Any]:
        """Classify one canonical legal row and return the normalized Choice."""
        request_body = build_authority_scope_decisions_request(
            classifier_input=classifier_input,
            model_id=model_id,
        )
        action_id = classifier_input.get("action_id")
        country_code = classifier_input.get("country_code")
        last_error: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                response_payload = self._post_decisions(request_body)
                parsed = parse_authority_scope_choice_answer(response_payload)
                logger.info(
                    "Jev authority-scope classification succeeded "
                    "country=%s action_id=%s attempt=%s confidence=%.3f label=%s",
                    country_code,
                    action_id,
                    attempt + 1,
                    parsed["confidence"],
                    parsed["selected_label"],
                )
                return parsed
            except OpenRouterJevError as error:
                last_error = error
                logger.warning(
                    "Jev authority-scope classification failed "
                    "country=%s action_id=%s attempt=%s error_type=%s",
                    country_code,
                    action_id,
                    attempt + 1,
                    type(error).__name__,
                )
                if attempt >= self._max_retries:
                    break
                time.sleep(min(2**attempt, 8))
        assert last_error is not None
        raise last_error

    def _post_decisions(self, request_body: dict[str, Any]) -> dict[str, Any]:
        """POST one Decisions payload and return the JSON body."""
        client = self._http_client
        owns_client = client is None
        if client is None:
            client = httpx.Client(timeout=self._timeout_seconds)
        try:
            response = client.post(
                OPENROUTER_DECISIONS_URL,
                headers=self._headers(),
                json=request_body,
            )
        except httpx.TimeoutException as error:
            raise OpenRouterJevError("OpenRouter Jev request timed out") from error
        except httpx.HTTPError as error:
            raise OpenRouterJevError("OpenRouter Jev transport failed") from error
        finally:
            if owns_client:
                client.close()

        if response.status_code in {401, 403}:
            raise OpenRouterJevError("OpenRouter Jev authentication failed")
        if response.status_code == 429:
            raise OpenRouterJevError("OpenRouter Jev rate limit exceeded")
        if response.status_code >= 500:
            raise OpenRouterJevError(
                f"OpenRouter Jev provider error status={response.status_code}"
            )
        if response.status_code >= 400:
            raise OpenRouterJevError(
                f"OpenRouter Jev request rejected status={response.status_code}"
            )
        try:
            payload = response.json()
        except ValueError as error:
            raise OpenRouterJevError("OpenRouter Jev returned non-JSON body") from error
        if not isinstance(payload, dict):
            raise OpenRouterJevError("OpenRouter Jev returned a non-object JSON body")
        return payload
