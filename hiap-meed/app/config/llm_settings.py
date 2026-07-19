"""Typed loader for shared non-secret LLM configuration."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel


class RoleModelConfig(BaseModel):
    name: str
    temperature: float


class ModelsConfig(BaseModel):
    alignment_other_preference: RoleModelConfig
    free_text_exclusions: RoleModelConfig
    explanations: RoleModelConfig
    explanation_translations: RoleModelConfig
    output_plan: RoleModelConfig


class FeaturesConfig(BaseModel):
    free_text_exclusions_enabled: bool = True
    explanations_enabled: bool = True


class OpenAIConfig(BaseModel):
    timeout_seconds: float = 30.0
    max_retries: int = 3


class LLMSettings(BaseModel):
    models: ModelsConfig
    features: FeaturesConfig = FeaturesConfig()
    openai: OpenAIConfig = OpenAIConfig()


def _resolve_llm_config_path() -> Path:
    cwd_path = Path.cwd() / "llm_config.yaml"
    if cwd_path.exists():
        return cwd_path

    repo_path = Path(__file__).resolve().parents[2] / "llm_config.yaml"
    if repo_path.exists():
        return repo_path

    raise FileNotFoundError(f"LLM config file not found at {repo_path}")


@lru_cache(maxsize=1)
def get_llm_settings() -> LLMSettings:
    config_path = _resolve_llm_config_path()
    with config_path.open("r", encoding="utf-8") as handle:
        raw_config = yaml.safe_load(handle) or {}
    return LLMSettings.model_validate(raw_config)
