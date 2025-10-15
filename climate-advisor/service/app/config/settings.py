"""
Climate Advisor Configuration Module

This module is responsible for loading and orchestrating all configuration for the Climate Advisor service.
It serves as the integration layer between multiple configuration sources:

1. LLM Configuration (llm_config.yaml): Models, prompts, generation parameters, API settings
2. Environment Variables (.env): Sensitive data, deployment-specific overrides
3. Application Defaults: Fallback values for optional settings

The module provides a unified Settings object that combines all configuration sources
with proper validation, type safety, and environment-specific overrides.

Key Components:
- LLMConfig: Pydantic models for YAML-based LLM configuration
- Settings: Main configuration class combining all sources
- get_settings(): Singleton factory for application-wide config access

Usage:
    from app.config import get_settings
    settings = get_settings()
    # Access LLM config: settings.llm.models.default
    # Access app config: settings.port, settings.database_url
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Any

import yaml
from dotenv import find_dotenv, load_dotenv, dotenv_values
from pydantic import BaseModel

_ENV_LOADED = False


def _load_environment() -> None:
    """Load environment variables from the most relevant .env files.

    We prioritise the current working directory, then fall back to the
    climate-advisor service folder and finally the repository root.
    """
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    candidate_paths: list[Path] = []

    dotenv_path = find_dotenv(usecwd=True)
    if dotenv_path:
        candidate_paths.append(Path(dotenv_path))

    service_root = Path(__file__).resolve().parents[3]  # climate-advisor/
    candidate_paths.append(service_root / ".env")

    repo_root = service_root.parent  # CityCatalyst/
    candidate_paths.append(repo_root / ".env")

    loaded_paths: set[Path] = set()
    for candidate in candidate_paths:
        try:
            resolved = candidate.resolve()
        except FileNotFoundError:
            # Path.resolve(strict=False) (default) should not raise, but guard just in case.
            resolved = candidate

        if resolved in loaded_paths or not resolved.exists():
            continue

        loaded = load_dotenv(resolved, override=False)
        if loaded:
            # Backfill missing (or empty) values explicitly to handle environments
            # that scrub secrets by setting them to empty strings.
            for key, value in dotenv_values(resolved).items():
                if value is None:
                    continue
                current = os.getenv(key)
                if current is None:
                    os.environ[key] = value
        loaded_paths.add(resolved)

    _ENV_LOADED = True


# Load environment variables at import time so that downstream modules/tests
# see expected values even before get_settings() is invoked.
_load_environment()


def _parse_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: Optional[str], default: Optional[int]) -> Optional[int]:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


class ModelConfig(BaseModel):
    name: str
    description: Optional[str] = None
    supports_streaming: Optional[bool] = None
    default_temperature: float


class GenerationDefaults(BaseModel):
    temperature: float
    top_p: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None


class GenerationLimits(BaseModel):
    temperature: Optional[Dict[str, float]] = None
    top_p: Optional[Dict[str, float]] = None
    frequency_penalty: Optional[Dict[str, float]] = None
    presence_penalty: Optional[Dict[str, float]] = None


class GenerationConfig(BaseModel):
    defaults: GenerationDefaults
    limits: Optional[GenerationLimits] = None


class PromptsConfig(BaseModel):
    default: str
    inventory_context: Optional[str] = None
    data_analysis: Optional[str] = None

    def get_prompt(self, prompt_type: str) -> str:
        """Load prompt content from file."""
        from pathlib import Path

        # Get the prompt file path from config
        prompt_path = getattr(self, prompt_type)
        if not prompt_path:
            raise ValueError(f"Prompt type '{prompt_type}' not configured")

        # Construct full path - look in current working directory first (container)
        # then fall back to relative path from this file
        cwd_path = Path.cwd() / prompt_path
        if cwd_path.exists():
            full_path = cwd_path
        else:
            # Fallback to relative path from this file (for local development)
            config_dir = Path(__file__).parent.parent.parent.parent.parent
            full_path = config_dir / prompt_path

        if not full_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {full_path}")

        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read().strip()


class OpenRouterConfig(BaseModel):
    base_url: str
    timeout_ms: Optional[int] = None
    retry_attempts: Optional[int] = None
    retry_delay_ms: Optional[int] = None


class OpenAIConfig(BaseModel):
    base_url: str
    timeout_ms: Optional[int] = None
    embedding_model: str


class APIConfig(BaseModel):
    openrouter: OpenRouterConfig
    openai: OpenAIConfig
    requests: Optional[Dict[str, Any]] = None


class ToolConfig(BaseModel):
    climate_vector_search: Dict[str, Any] = {
        "top_k": 5,
        "min_score": 0.6,
    }


class ConversationConfig(BaseModel):
    history_limit: Optional[int] = 5
    include_history: Optional[bool] = True


class FeaturesConfig(BaseModel):
    streaming_enabled: Optional[bool] = None
    dynamic_model_selection: Optional[bool] = None
    dynamic_parameters: Optional[bool] = None
    inventory_context_injection: Optional[bool] = None


class LoggingConfig(BaseModel):
    log_requests: Optional[bool] = None
    log_responses: Optional[bool] = None
    log_performance: Optional[bool] = None
    log_usage_stats: Optional[bool] = None


class LangSmithConfig(BaseModel):
    project: Optional[str] = None
    endpoint: Optional[str] = None
    tracing_enabled: Optional[bool] = None


class ObservabilityConfig(BaseModel):
    langsmith: Optional[LangSmithConfig] = None


class CacheConfig(BaseModel):
    enabled: Optional[bool] = None
    ttl_seconds: Optional[int] = None
    max_size_mb: Optional[int] = None


class LLMConfig(BaseModel):
    models: Dict[str, Any]
    generation: GenerationConfig
    prompts: PromptsConfig
    api: APIConfig
    conversation: Optional[ConversationConfig] = ConversationConfig()
    features: FeaturesConfig
    logging: LoggingConfig
    cache: Optional[CacheConfig] = None
    tools: ToolConfig = ToolConfig()
    observability: Optional[ObservabilityConfig] = None


def _load_llm_config() -> LLMConfig:
    """Load LLM configuration from YAML file."""
    # Look for the config file in the current working directory (container root)
    config_path = Path.cwd() / "llm_config.yaml"

    # Also try the parent directory for local development
    if not config_path.exists():
        config_path = Path(__file__).parent.parent.parent.parent / "llm_config.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"LLM config file not found at {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        config_data = yaml.safe_load(f)

    return LLMConfig(**config_data)


class Settings(BaseModel):
    app_name: str = "Climate Advisor Service"
    port: int = int(os.getenv("CA_PORT", "8080"))
    log_level: str = os.getenv("CA_LOG_LEVEL", "info")
    cors_origins: List[str] = []

    # LLM Configuration (loaded from YAML)
    llm: LLMConfig

    # OpenRouter configuration (kept for backward compatibility)
    openrouter_api_key: str | None = os.getenv("OPENROUTER_API_KEY")
    openrouter_base_url: str | None = None  # Will be overridden by LLM config
    openrouter_model: str | None = None     # Will be overridden by LLM config

    # OpenAI configuration for embeddings
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")

    # LangSmith tracing configuration
    # Only API key comes from .env for security
    # All other settings (endpoint, project, tracing_enabled) must be in llm_config.yaml
    langsmith_api_key: str | None = os.getenv("LANGSMITH_API_KEY")
    langsmith_endpoint: str | None = None
    langsmith_project: str | None = None
    langsmith_tracing_enabled: bool = False

    # Database configuration
    database_url: str | None = os.getenv("CA_DATABASE_URL")
    database_pool_size: Optional[int] = _parse_int(os.getenv("CA_DATABASE_POOL_SIZE"), 5)
    database_max_overflow: Optional[int] = _parse_int(os.getenv("CA_DATABASE_MAX_OVERFLOW"), 10)
    database_pool_timeout: Optional[int] = _parse_int(os.getenv("CA_DATABASE_POOL_TIMEOUT"), 30)
    database_echo: bool = _parse_bool(os.getenv("CA_DATABASE_ECHO"), False)

    # Future CityCatalyst integration placeholders
    cc_base_url: str | None = os.getenv("CC_BASE_URL")
    cc_oauth_client_id: str | None = os.getenv("CC_OAUTH_CLIENT_ID")
    cc_oauth_client_secret: str | None = os.getenv("CC_OAUTH_CLIENT_SECRET")
    cc_oauth_token_url: str | None = os.getenv("CC_OAUTH_TOKEN_URL")

    def model_post_init(self, __context: Any) -> None:
        """Override OpenRouter settings with LLM config values."""
        # Override with LLM config values, allowing env vars to take precedence
        if self.openrouter_base_url is None:
            self.openrouter_base_url = self.llm.api.openrouter.base_url
        
        if self.openrouter_model is None:
            self.openrouter_model = self.llm.models.get("default", "openrouter/auto")

        # LangSmith configuration: ONLY API key from .env, everything else from llm_config.yaml
        # No silent fallbacks - configuration must be explicit
        langsmith_cfg = None
        if self.llm.observability:
            langsmith_cfg = self.llm.observability.langsmith

        # Load configuration from llm_config.yaml ONLY
        if langsmith_cfg:
            if langsmith_cfg.project:
                self.langsmith_project = langsmith_cfg.project
            
            if langsmith_cfg.endpoint:
                self.langsmith_endpoint = langsmith_cfg.endpoint
            
            if langsmith_cfg.tracing_enabled is not None:
                self.langsmith_tracing_enabled = bool(langsmith_cfg.tracing_enabled)

        # Validate LangSmith configuration if tracing is enabled
        if self.langsmith_tracing_enabled:
            missing: list[str] = []
            if not self.langsmith_api_key:
                missing.append("LANGSMITH_API_KEY (.env)")
            if not self.langsmith_endpoint:
                missing.append("observability.langsmith.endpoint (llm_config.yaml)")
            if not self.langsmith_project:
                missing.append("observability.langsmith.project (llm_config.yaml)")

            if missing:
                logging.warning(
                    "LangSmith tracing disabled because the following required configuration values are missing: %s",
                    ", ".join(missing),
                )
                self.langsmith_tracing_enabled = False
                return
            
            # Surface configuration to the expected environment variables for LangSmith/LangChain SDKs
            os.environ.setdefault("LANGSMITH_TRACING_V2", "true")
            os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")

            if self.langsmith_project:
                os.environ.setdefault("LANGSMITH_PROJECT", self.langsmith_project)
                os.environ.setdefault("LANGCHAIN_PROJECT", self.langsmith_project)

            if self.langsmith_endpoint:
                os.environ.setdefault("LANGSMITH_ENDPOINT", self.langsmith_endpoint)
                os.environ.setdefault("LANGCHAIN_ENDPOINT", self.langsmith_endpoint)

            if self.langsmith_api_key:
                os.environ.setdefault("LANGSMITH_API_KEY", self.langsmith_api_key)
                os.environ.setdefault("LANGCHAIN_API_KEY", self.langsmith_api_key)



_settings: Settings | None = None


def _parse_cors_origins(env_value: str | None) -> List[str]:
    if not env_value:
        return ["http://localhost:8000"]  # dev default
    return [origin.strip() for origin in env_value.split(",") if origin.strip()]


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _load_environment()

        # Load LLM configuration from YAML
        llm_config = _load_llm_config()

        # Create settings with LLM config
        settings = Settings(llm=llm_config)
        settings.cors_origins = _parse_cors_origins(os.getenv("CA_CORS_ORIGINS"))
        _settings = settings
    return _settings
