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

import os
from pathlib import Path
from typing import Dict, List, Optional, Any

import yaml
from dotenv import find_dotenv, load_dotenv
from pydantic import BaseModel


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
    limits: GenerationLimits


class PromptsConfig(BaseModel):
    default: str
    inventory_context: Optional[str] = None
    data_analysis: Optional[str] = None


class OpenRouterConfig(BaseModel):
    base_url: str
    timeout_ms: Optional[int] = None
    retry_attempts: Optional[int] = None
    retry_delay_ms: Optional[int] = None


class APIConfig(BaseModel):
    openrouter: OpenRouterConfig
    requests: Optional[Dict[str, Any]] = None


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


class CacheConfig(BaseModel):
    enabled: Optional[bool] = None
    ttl_seconds: Optional[int] = None
    max_size_mb: Optional[int] = None


class LLMConfig(BaseModel):
    models: Dict[str, Any]
    generation: GenerationConfig
    prompts: PromptsConfig
    api: APIConfig
    features: FeaturesConfig
    logging: LoggingConfig
    cache: CacheConfig


def _load_llm_config() -> LLMConfig:
    """Load LLM configuration from YAML file."""
    # Look for the config file in the climate-advisor root directory
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
    request_timeout_ms: int | None = None   # Will be overridden by LLM config

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
            
        if self.request_timeout_ms is None:
            self.request_timeout_ms = self.llm.api.openrouter.timeout_ms


_settings: Settings | None = None


def _parse_cors_origins(env_value: str | None) -> List[str]:
    if not env_value:
        return ["*"]  # dev default
    return [origin.strip() for origin in env_value.split(",") if origin.strip()]


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        load_dotenv(find_dotenv(usecwd=True))
        
        # Load LLM configuration from YAML
        llm_config = _load_llm_config()
        
        # Create settings with LLM config
        settings = Settings(llm=llm_config)
        settings.cors_origins = _parse_cors_origins(os.getenv("CA_CORS_ORIGINS"))
        _settings = settings
    return _settings
