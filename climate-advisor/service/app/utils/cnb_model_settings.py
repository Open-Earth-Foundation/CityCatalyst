"""Shared opt-in settings for provider-visible Concept Note summaries."""

from agents import ModelSettings
from openai.types.shared import ReasoningEffort


def cnb_model_settings(
    effort: ReasoningEffort | None,
    *,
    responses: bool = True,
    temperature: float | None = None,
) -> ModelSettings:
    """Request detailed summaries using the selected API's parameter format."""
    reasoning = {"effort": effort, "summary": "detailed"}
    return ModelSettings(
        temperature=temperature,
        include_usage=True,
        reasoning=reasoning if responses else {"effort": effort},
        store=False if responses else None,
        extra_body=None
        if responses
        else {
            "reasoning": {**reasoning, "exclude": False},
        },
    )
