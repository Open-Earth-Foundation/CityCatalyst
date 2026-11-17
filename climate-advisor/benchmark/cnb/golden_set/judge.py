"""Configured OpenRouter judge for the CNB golden set; no production side effects.

Each stage has its own prompt and structured output type. One judgment per
stage and fixture: no voting, repetition, or tools.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from collections.abc import Iterable
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, RunConfig, Runner
from app.config import Settings
from app.services.openrouter_client import build_openrouter_client_options
from openai import AsyncOpenAI

from benchmark.cnb.golden_set.core import LoadedFixture
from benchmark.cnb.golden_set.models import (
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


def _example_nodes(value: object, path: str) -> Iterable[tuple[str, object]]:
    """Walk JSON values with stable paths for actionable diagnostics."""
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _example_nodes(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _example_nodes(child, f"{path}[{index}]")


def _example_normalized(text: str) -> str:
    """Case-fold and collapse punctuation/whitespace to single spaces."""
    return " ".join(re.sub(r"[\W_]+", " ", text.casefold()).split())


def judge_example_problems(
    fixtures: list[LoadedFixture], prompts: dict[str, str]
) -> list[str]:
    """Check loaded example JSON offline against every fixture's answer key.

    Anchored objects with non-null ``fixture`` and ``source_passage`` must quote
    an exact, nonempty substring of that fixture's original source Markdown.
    Prose string values in both example blocks are checked against extraction
    evidence and fact statements, drafting facts/gaps, seeded edit find/replace
    text, and editing expected-change/preservation statements across ALL fixtures.
    Overlap means a shared contiguous substring of at least 40 characters after
    case-folding and collapsing punctuation/whitespace, OR containment of an
    entire nonempty normalized golden text (even if shorter than 40 characters).
    Locator fields ``unit`` and ``unit_id`` are excluded: a source filename
    is not an answer. This lexical guard cannot detect arbitrary paraphrases.

    Return path-labelled problems, including malformed/missing JSON blocks;
    log only counts. No provider calls or fixture/prompt mutations occur.
    """
    # Collect answer-bearing fields with fixture paths for diagnostic messages.
    sources = {item.fixture.fixture_id: item.markdown for item in fixtures}
    golden: list[tuple[str, str, set[str]]] = []
    for loaded in fixtures:
        fixture = loaded.fixture
        sections = {"extraction": {"facts": fixture.extraction.model_dump()["facts"]}}
        for stage in ("chapter_writing", "verification", "editing"):
            section = getattr(fixture, stage)
            if section is not None:
                sections[stage] = section.model_dump()
        for path, value in _example_nodes(sections, fixture.fixture_id):
            if isinstance(value, str) and path.rsplit(".", 1)[-1] in {
                "statement", "text", "find", "replace"
            }:
                normalized = _example_normalized(value)
                if normalized:
                    windows = {normalized[i:i + 40] for i in range(len(normalized) - 39)}
                    golden.append((path, normalized, windows))

    # Standalone tags exclude inline references in task instructions.
    problems: list[str] = []
    for stage, prompt in prompts.items():
        for tag in ("examples", "example_output"):
            blocks = re.findall(rf"(?m)^[ \t]*<{tag}>(.*?)</{tag}>", prompt, re.S)
            if not blocks:
                problems.append(f"{stage}.{tag}: missing JSON block")
            for index, block in enumerate(blocks):
                location = f"{stage}.{tag}[{index}]"
                try:
                    value = json.loads(block)
                except json.JSONDecodeError:
                    problems.append(f"{location}: invalid JSON")
                    continue
                for path, node in _example_nodes(value, location):
                    if isinstance(node, dict) and node.get("source_passage") is not None:
                        if node.get("fixture") is not None:
                            passage = node["source_passage"]
                            source = sources.get(str(node["fixture"]), "")
                            if not isinstance(passage, str) or not passage or passage not in source:
                                problems.append(f"{path}: source_passage is not exact fixture text")
                    if isinstance(node, str) and path.rsplit(".", 1)[-1] not in {"unit", "unit_id"}:
                        normalized = _example_normalized(node)
                        windows = {normalized[i:i + 40] for i in range(len(normalized) - 39)}
                        for golden_path, text, golden_windows in golden:
                            if text in normalized or windows & golden_windows:
                                problems.append(f"{path}: overlaps {golden_path}")
    logger.info("Checked judge examples prompts=%s problems=%s", len(prompts), len(problems))
    return problems


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
            runner.run(
                agent,
                payload.model_dump_json(),
                run_config=RunConfig(tracing_disabled=True, trace_include_sensitive_data=False),
            ),
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
