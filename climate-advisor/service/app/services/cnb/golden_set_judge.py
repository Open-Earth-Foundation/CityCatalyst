"""Configured OpenRouter judge for the CNB golden set; no production side effects."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.models.cnb.golden_set import JudgeEvaluation, JudgeInput
from app.services.openrouter_client import build_openrouter_client_options
from openai import AsyncOpenAI

from app.config import Settings

logger = logging.getLogger(__name__)
PROMPT_KEYS = {
    "source_analysis": "cnb_golden_set_source_judge",
    "drafting": "cnb_golden_set_drafting_judge",
    "end_to_end": "cnb_golden_set_drafting_judge",
}


class GoldenJudgeError(RuntimeError):
    """The judge could not produce an evaluation; not a product-quality verdict."""


def judge_prompt_versions(settings: Settings) -> dict[str, str]:
    """Fingerprint the actual loaded prompts for reviewable report provenance."""
    return {
        stage: hashlib.sha256(settings.llm.prompts.get_prompt(key).encode()).hexdigest()
        for stage, key in PROMPT_KEYS.items()
    }


async def judge_output(
    payload: JudgeInput,
    settings: Settings,
    *,
    runner: Any = Runner,
) -> JudgeEvaluation:
    """Judge once with a structured schema and bounded runtime; close the client.

    Provider, timeout, and parsing failures raise ``GoldenJudgeError``. Source
    content and provider exception bodies are never written to the log.
    """
    model = settings.llm.models.cnb_golden_set_judge
    if model is None:
        raise GoldenJudgeError(
            "Configure models.cnb_golden_set_judge in llm_config.yaml"
        )
    options = build_openrouter_client_options(
        settings,
        missing_api_key_message="OpenRouter API key is required for the golden-set judge",
        error_cls=GoldenJudgeError,
    )
    client = AsyncOpenAI(**options.kwargs)
    try:
        agent = Agent(
            name="CNB golden-set judge",
            instructions=settings.llm.prompts.get_prompt(PROMPT_KEYS[payload.stage]),
            model=OpenAIChatCompletionsModel(model=model.name, openai_client=client),
            model_settings=ModelSettings(
                include_usage=True,
                reasoning={"effort": model.reasoning_effort},
            ),
            output_type=JudgeEvaluation,
            tools=[],
        )
        logger.info(
            "Judging CNB golden set stage=%s model=%s", payload.stage, model.name
        )
        result = await asyncio.wait_for(
            runner.run(agent, payload.model_dump_json()),
            timeout=600,
        )
        return JudgeEvaluation.model_validate(result.final_output)
    except Exception as exc:
        logger.warning(
            "Golden judge unavailable stage=%s error_type=%s",
            payload.stage,
            type(exc).__name__,
        )
        raise GoldenJudgeError(f"judge_failed: {type(exc).__name__}") from exc
    finally:
        await client.close()
