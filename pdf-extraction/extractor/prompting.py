"""Load editable prompts and keep the service's result-file contract explicit."""

from pathlib import Path

PROMPT_DIR = Path(__file__).with_name("prompts")
MAX_PROMPT_BYTES = 64 * 1024


def default_prompts() -> dict[str, str]:
    """Return the reusable system instructions and per-report user request."""
    return {
        "system_prompt": (PROMPT_DIR / "extract.md").read_text(encoding="utf-8"),
        "user_prompt": (PROMPT_DIR / "user.md").read_text(encoding="utf-8"),
    }


def resolve_prompts(
    system_prompt: str | None, user_prompt: str | None
) -> dict[str, str]:
    """Use defaults for omitted prompts and reject oversized or empty system text."""
    prompts = default_prompts()
    for name, value in (("system_prompt", system_prompt), ("user_prompt", user_prompt)):
        if value is not None:
            prompts[name] = value
        if len(prompts[name].encode("utf-8")) > MAX_PROMPT_BYTES:
            raise ValueError(f"{name} must be 64 KiB or smaller.")
    if not prompts["system_prompt"].strip():
        raise ValueError("system_prompt must not be blank. Omit it to use the default.")
    return prompts


def agent_instructions(system_prompt: str) -> str:
    """Append the output contract needed by the UI to any editable system prompt."""
    return (
        system_prompt
        + "\n\n"
        + (PROMPT_DIR / "contract.md").read_text(encoding="utf-8")
    )
