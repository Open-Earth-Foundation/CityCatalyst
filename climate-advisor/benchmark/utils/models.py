"""Provider usage contracts shared by benchmark suites."""

from pydantic import BaseModel, ConfigDict, Field


class AgentUsage(BaseModel):
    """Model requests one agent made: count, tokens, provider cost, and time.

    ``cost_usd`` is what OpenRouter reports per response, including the
    provider's charge for bring-your-own-key requests. ``request_seconds`` sums
    request durations, so concurrent requests can exceed the stage's wall time.
    """

    model_config = ConfigDict(extra="forbid")

    requests: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0
    cost_complete: bool = True
    unpriced_requests: int = 0
    request_seconds: float = 0.0


class StageUsage(AgentUsage):
    """Wall time of one fixture stage and its model usage, overall and per agent.

    ``agents`` is keyed by the configured prompt that sent each request (for
    example ``cnb_chapter_drafting``), or ``other``.
    """

    seconds: float = 0.0
    agents: dict[str, AgentUsage] = Field(default_factory=dict)
