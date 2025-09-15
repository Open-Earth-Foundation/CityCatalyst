import os
from typing import List
from pydantic import BaseModel
from dotenv import load_dotenv


class Settings(BaseModel):
    app_name: str = "Climate Advisor Service"
    port: int = int(os.getenv("CA_PORT", "8080"))
    log_level: str = os.getenv("CA_LOG_LEVEL", "info")
    cors_origins: List[str] = []

    # Placeholders for future integration (not used in TICKET-001)
    openrouter_api_key: str | None = os.getenv("OPENROUTER_API_KEY")
    openrouter_base_url: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    openrouter_model: str | None = os.getenv("OPENROUTER_MODEL")

    cc_base_url: str | None = os.getenv("CC_BASE_URL")
    cc_oauth_client_id: str | None = os.getenv("CC_OAUTH_CLIENT_ID")
    cc_oauth_client_secret: str | None = os.getenv("CC_OAUTH_CLIENT_SECRET")
    cc_oauth_token_url: str | None = os.getenv("CC_OAUTH_TOKEN_URL")


_settings: Settings | None = None


def _parse_cors_origins(env_value: str | None) -> List[str]:
    if not env_value:
        return ["*"]  # dev default
    # CSV or JSON-like list (simple CSV here)
    return [o.strip() for o in env_value.split(",") if o.strip()]


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        load_dotenv()  # load .env if present
        settings = Settings()
        settings.cors_origins = _parse_cors_origins(os.getenv("CA_CORS_ORIGINS"))
        _settings = settings
    return _settings

