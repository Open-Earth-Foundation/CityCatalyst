"""Shared opt-in settings for provider-visible Concept Note summaries."""

from agents import ModelSettings
from openai.types.shared import ReasoningEffort


def cnb_model_settings(
    effort: ReasoningEffort | None,
    *,
    responses: bool = True,
    temperature: float | None = None,
    prompt_cache_key: str | None = None,
) -> ModelSettings:
    """Request detailed summaries using the selected API's parameter format.

    `prompt_cache_key` groups calls that share a long prompt prefix; GPT-5.6 and
    later match the provider prompt cache reliably only with it, and OpenRouter
    uses it for sticky routing.
    """
    reasoning = {"effort": effort, "summary": "detailed"}
    return ModelSettings(
        temperature=temperature,
        extra_args={"prompt_cache_key": prompt_cache_key} if prompt_cache_key else None,
        include_usage=True,
        reasoning=reasoning if responses else {"effort": effort},
        store=False if responses else None,
        extra_body=None
        if responses
        else {
            "reasoning": {**reasoning, "exclude": False},
        },
    )
