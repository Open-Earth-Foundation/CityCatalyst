"""Read server configuration without exposing secrets to the hosted agent."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    """Configuration shared by the HTTP server and its OpenAI adapter."""

    openai_api_key: str
    service_api_key: str
    model: str = "gpt-6.1-sol"
    reasoning_effort: str = "medium"
    max_file_bytes: int = 45 * 1024 * 1024
    request_timeout: float = 120.0
    max_result_bytes: int = 20 * 1024 * 1024
    mistral_api_key: str = ""
    mistral_ocr_model: str = "mistral-ocr-4-1"
    ocr_timeout: float = 180.0
    state_path: str = ":memory:"

    @classmethod
    def from_env(cls) -> "Settings":
        """Load the standalone demo's .env; keep the UI usable before key setup."""
        load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
        upstream = os.environ.get("OPENAI_API_KEY", "")
        service = os.environ.get("EXTRACTION_API_KEY", "")
        if service and len(service) < 32:
            raise ValueError(
                "EXTRACTION_API_KEY must contain at least 32 characters when set."
            )
        effort = os.environ.get("EXTRACTION_REASONING_EFFORT", "medium")
        if effort not in {"low", "medium", "high", "xhigh", "max"}:
            raise ValueError(
                "EXTRACTION_REASONING_EFFORT must be low, medium, high, xhigh, or max."
            )
        return cls(
            openai_api_key=upstream,
            service_api_key=service,
            model=os.environ.get("EXTRACTION_MODEL", "gpt-6.1-sol"),
            reasoning_effort=effort,
            mistral_api_key=os.environ.get("MISTRAL_API_KEY", ""),
            mistral_ocr_model=os.environ.get("MISTRAL_OCR_MODEL", "mistral-ocr-4-1"),
            state_path=os.environ.get(
                "EXTRACTION_STATE_PATH",
                str(Path(__file__).resolve().parents[1] / ".data" / "jobs.sqlite3"),
            ),
        )
