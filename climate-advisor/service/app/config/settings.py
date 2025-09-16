import os
from typing import List, Optional

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


class Settings(BaseModel):
    app_name: str = "Climate Advisor Service"
    port: int = int(os.getenv("CA_PORT", "8080"))
    log_level: str = os.getenv("CA_LOG_LEVEL", "info")
    cors_origins: List[str] = []

    # OpenRouter configuration
    openrouter_api_key: str | None = os.getenv("OPENROUTER_API_KEY")
    openrouter_base_url: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    openrouter_model: str | None = os.getenv("OPENROUTER_MODEL")
    request_timeout_ms: int = int(os.getenv("REQUEST_TIMEOUT_MS", "30000"))

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


_settings: Settings | None = None


def _parse_cors_origins(env_value: str | None) -> List[str]:
    if not env_value:
        return ["*"]  # dev default
    return [origin.strip() for origin in env_value.split(",") if origin.strip()]


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        load_dotenv(find_dotenv(usecwd=True))
        settings = Settings()
        settings.cors_origins = _parse_cors_origins(os.getenv("CA_CORS_ORIGINS"))
        _settings = settings
    return _settings
