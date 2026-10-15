"""Configured OpenRouter judge for the CNB golden set; no production side effects.

Each stage has its own prompt and structured output type. One judgment per
stage and fixture: no voting, repetition, or tools.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from collections.abc import Iterable
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings
from app.services.openrouter_client import build_openrouter_client_options
from openai import AsyncOpenAI

from benchmark.golden_set.models import (
    ChapterWritingEvaluation,
    EditingEvaluation,
    EditingJudgeInput,
    GoldenContract,
    JudgeEvaluation,
    JudgeInput,
    VerificationEvaluation,
    VerificationJudgeInput,
)

logger = logging.getLogger(__name__)
PROMPT_KEYS = {
    "extraction": "cnb_golden_set_extraction_judge",
    "chapter_writing": "cnb_golden_set_chapter_writing_judge",
    "verification": "cnb_golden_set_verification_judge",
    "editing": "cnb_golden_set_editing_judge",
}
OUTPUT_TYPES: dict[str, type[GoldenContract]] = {
    "extraction": JudgeEvaluation,
    "chapter_writing": ChapterWritingEvaluation,
    "verification": VerificationEvaluation,
    "editing": EditingEvaluation,
}
JudgePayload = JudgeInput | VerificationJudgeInput | EditingJudgeInput
JUDGE_TIMEOUT_SECONDS = 900


class GoldenJudgeError(RuntimeError):
    """The judge could not produce an evaluation; not a product-quality verdict."""


def judge_prompt_versions(
    settings: Settings, stages: Iterable[str] | None = None
) -> dict[str, str]:
    """Fingerprint the loaded prompts of the evaluated stages for report provenance."""
    selected = PROMPT_KEYS if stages is None else {s: PROMPT_KEYS[s] for s in stages}
    return {
        stage: hashlib.sha256(settings.llm.prompts.get_prompt(key).encode()).hexdigest()
        for stage, key in selected.items()
    }


async def judge_output(
    payload: JudgePayload,
    settings: Settings,
    *,
    runner: Any = Runner,
) -> GoldenContract:
    """Judge once with the stage's structured schema and bounded runtime.

    Provider, timeout, and parsing failures raise ``GoldenJudgeError``. Source
    content and provider exception bodies are never written to the log.
    """
    model = settings.llm.models.cnb_golden_set_judge
    if model is None:
        raise GoldenJudgeError(
            "Configure models.cnb_golden_set_judge in llm_config.yaml"
        )
    output_type = OUTPUT_TYPES[payload.stage]
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
            output_type=output_type,
            tools=[],
        )
        logger.info(
            "Judging CNB golden set stage=%s model=%s", payload.stage, model.name
        )
        result = await asyncio.wait_for(
            runner.run(agent, payload.model_dump_json()),
            timeout=JUDGE_TIMEOUT_SECONDS,
        )
        return output_type.model_validate(result.final_output)
    except Exception as exc:
        logger.warning(
            "Golden judge unavailable stage=%s error_type=%s",
            payload.stage,
            type(exc).__name__,
        )
        raise GoldenJudgeError(f"judge_failed: {type(exc).__name__}") from exc
    finally:
        await client.close()
