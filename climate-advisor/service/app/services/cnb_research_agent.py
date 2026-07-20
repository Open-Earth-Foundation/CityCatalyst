"""Functions for seed capture and the bounded CNB research agent loop."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging

from openai import OpenAI
from pydantic import JsonValue

from app.models.cnb_research import (
    AgentTurn,
    FunderProfileResearchResult,
    FundingOpportunityResearchAgentDraft,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    ResearchGap,
)
from app.tools.firecrawl import (
    FIRECRAWL_TOOL_DEFINITIONS,
    FirecrawlClient,
    FirecrawlError,
    execute_firecrawl_tool,
)

logger = logging.getLogger(__name__)

FINAL_GAP_AUDIT = (
    "Before returning the final object, systematically audit: award minima and "
    "maxima; currencies; criterion weights and hard gates; selection timing and "
    "rates; co-financing; application-template availability; requested versus "
    "awarded amounts and fiscal periods; action-level costs; downstream financing "
    "status; published pipeline status; and source-license status. Preserve unknown "
    "values as null or empty and add precise ResearchGap entries."
)


@dataclass(frozen=True)
class AgentLoopOutcome:
    """Structured result plus code-owned information about loop completion."""

    result: FundingOpportunityResearchResult
    turns_used: int
    termination_reason: str
    missing_data: list[str]


def scrape_seed_sources(
    *,
    request: FundingOpportunityResearchRequest,
    firecrawl: FirecrawlClient,
    trace: list[AgentTurn],
    gaps: list[ResearchGap],
) -> list[dict[str, JsonValue]]:
    """Scrape authoritative funder, program, and optional template URLs."""
    seeds = [
        ("funder", str(request.funder_url)),
        ("program", str(request.program_url)),
    ]
    if request.application_template_url is not None:
        seeds.append(("application_template", str(request.application_template_url)))

    results: list[dict[str, JsonValue]] = []
    for label, url in seeds:
        try:
            result = firecrawl.scrape(url=url)
            results.append({"seed_type": label, **result})
            summary = summarize_tool_result("firecrawl_scrape", result)
        except FirecrawlError as exc:
            logger.warning("Seed scrape failed for %s: %s", url, exc)
            results.append({"seed_type": label, "url": url, "error": str(exc)})
            summary = str(exc)
            gaps.append(
                ResearchGap(
                    target_path=f"sources.seed_{label}",
                    reason=f"The authoritative seed URL could not be scraped: {exc}",
                )
            )
        trace.append(
            AgentTurn(
                turn=0,
                action=f"firecrawl_scrape_seed_{label}",
                query_or_url=url,
                result_summary=summary,
            )
        )
    return results


def run_agent_loop(
    *,
    request: FundingOpportunityResearchRequest,
    seed_sources: list[dict[str, JsonValue]],
    firecrawl: FirecrawlClient,
    trace: list[AgentTurn],
    openai_client: OpenAI,
    model_name: str,
    reasoning_effort: str,
    prompt: str,
) -> AgentLoopOutcome:
    """Run model-selected Firecrawl turns followed by one explicit gap audit."""
    current_filled_object = request.current_filled_object or empty_result(request)
    missing_data = find_missing_data(current_filled_object, request=request)
    current_input: str | list[dict[str, JsonValue]] = json.dumps(
        {
            "research_request": request.model_dump(
                mode="json",
                exclude={"current_filled_object"},
            ),
            "current_filled_object": current_filled_object.model_dump(mode="json"),
            "seed_sources": seed_sources,
            "missing_data": missing_data,
            "turn_budget": turn_budget(
                turn_number=1,
                max_turns=request.max_turns,
                final_audit=request.max_turns == 1,
            ),
            "research_stage": research_stage(missing_data),
            "final_gap_audit": (
                FINAL_GAP_AUDIT if request.max_turns == 1 else None
            ),
        },
        ensure_ascii=False,
    )
    previous_response_id: str | None = None
    finalizing_for_coverage = False

    for turn_number in range(1, request.max_turns + 1):
        is_final_audit = finalizing_for_coverage or turn_number == request.max_turns
        if previous_response_id is not None:
            assert isinstance(current_input, list)
            current_input.append(
                turn_context_message(
                    current_filled_object=current_filled_object,
                    missing_data=missing_data,
                    turn_number=turn_number,
                    max_turns=request.max_turns,
                    final_audit=is_final_audit,
                )
            )

        request_kwargs: dict[str, object] = {
            "model": model_name,
            "reasoning": {"effort": reasoning_effort},
            "instructions": prompt,
            "input": current_input,
            "text_format": FundingOpportunityResearchResult,
            "store": True,
        }
        if previous_response_id is not None:
            request_kwargs["previous_response_id"] = previous_response_id
        if not is_final_audit:
            request_kwargs["tools"] = FIRECRAWL_TOOL_DEFINITIONS
            request_kwargs["parallel_tool_calls"] = False

        logger.info(
            "Starting CNB research model turn %s/%s stage=%s tools=%s missing=%s",
            turn_number,
            request.max_turns,
            "final_gap_audit" if is_final_audit else research_stage(missing_data),
            not is_final_audit,
            len(missing_data),
        )
        response = openai_client.responses.parse(**request_kwargs)
        tool_calls = [
            item for item in response.output if item.type == "function_call"
        ]

        if not tool_calls:
            if response.output_parsed is None:
                raise RuntimeError(
                    "Research model returned neither a tool call nor structured output"
                )
            current_filled_object = response.output_parsed
            missing_data = find_missing_data(current_filled_object, request=request)
            trace.append(
                AgentTurn(
                    turn=turn_number,
                    action=(
                        "final_gap_audit"
                        if is_final_audit
                        else "structured_candidate"
                    ),
                    query_or_url="",
                    result_summary=(
                        f"Returned structured output with {len(missing_data)} "
                        "coverage targets unresolved."
                    ),
                )
            )

            if is_final_audit:
                return AgentLoopOutcome(
                    result=current_filled_object,
                    turns_used=turn_number,
                    termination_reason=(
                        "coverage_complete"
                        if finalizing_for_coverage or not missing_data
                        else "turn_limit"
                    ),
                    missing_data=missing_data,
                )
            if not missing_data:
                previous_response_id = response.id
                current_input = []
                finalizing_for_coverage = True
                continue

            previous_response_id = response.id
            current_input = []
            continue

        tool_outputs = execute_tool_calls(
            tool_calls=tool_calls,
            turn_number=turn_number,
            firecrawl=firecrawl,
            trace=trace,
        )
        previous_response_id = response.id
        current_input = tool_outputs

    raise RuntimeError("Research model exhausted turns without a structured result")


def empty_result(
    request: FundingOpportunityResearchRequest,
) -> FundingOpportunityResearchResult:
    """Create the seed-preserving starting object shown to the research model."""
    return FundingOpportunityResearchResult(
        opportunity=FundingOpportunityResearchAgentDraft(
            funder_name=request.funder_name,
            funder_url=str(request.funder_url),
            funder_profile=FunderProfileResearchResult(),
            program_name=request.program_name,
            program_url=str(request.program_url),
        )
    )


def execute_tool_calls(
    *,
    tool_calls: list[object],
    turn_number: int,
    firecrawl: FirecrawlClient,
    trace: list[AgentTurn],
) -> list[dict[str, JsonValue]]:
    """Execute the model-selected Firecrawl calls and retain concise trace rows."""
    tool_outputs: list[dict[str, JsonValue]] = []
    for tool_call in tool_calls:
        arguments = json.loads(tool_call.arguments)
        try:
            tool_result = execute_firecrawl_tool(
                firecrawl,
                tool_name=tool_call.name,
                arguments=arguments,
            )
        except (FirecrawlError, ValueError) as exc:
            logger.warning("Research tool %s failed: %s", tool_call.name, exc)
            tool_result = {"error": str(exc)}

        trace.append(
            AgentTurn(
                turn=turn_number,
                action=tool_call.name,
                query_or_url=str(arguments.get("query") or arguments.get("url") or ""),
                result_summary=summarize_tool_result(tool_call.name, tool_result),
            )
        )
        tool_outputs.append(
            {
                "type": "function_call_output",
                "call_id": tool_call.call_id,
                "output": json.dumps(tool_result, ensure_ascii=False),
            }
        )
    return tool_outputs


def turn_context_message(
    *,
    current_filled_object: FundingOpportunityResearchResult,
    missing_data: list[str],
    turn_number: int,
    max_turns: int,
    final_audit: bool,
) -> dict[str, JsonValue]:
    """Build the explicit progress, missing-data, and remaining-turn reminder."""
    budget = turn_budget(
        turn_number=turn_number,
        max_turns=max_turns,
        final_audit=final_audit,
    )
    missing_lines = "\n".join(f"- {item}" for item in missing_data) or "- none"
    final_instruction = (
        f"\n<final_gap_audit>{FINAL_GAP_AUDIT}</final_gap_audit>"
        if final_audit
        else ""
    )
    content = (
        "<current_filled_object>\n"
        f"{current_filled_object.model_dump_json(indent=2)}\n"
        "</current_filled_object>\n"
        "<missing_data>\n"
        f"{missing_lines}\n"
        "</missing_data>\n"
        "<turn_budget>\n"
        f"current_turn: {budget['current_turn']}\n"
        f"max_turns: {budget['max_turns']}\n"
        f"turns_remaining_after_this: {budget['turns_remaining_after_this']}\n"
        f"final_audit: {str(final_audit).lower()}\n"
        "</turn_budget>\n"
        f"<next_step>{next_step(missing_data, final_audit=final_audit)}</next_step>"
        f"{final_instruction}"
    )
    return {"role": "user", "content": content}


def turn_budget(
    *,
    turn_number: int,
    max_turns: int,
    final_audit: bool,
) -> dict[str, JsonValue]:
    """Return the turn counters that are supplied to the model every turn."""
    return {
        "current_turn": turn_number,
        "max_turns": max_turns,
        "turns_remaining_after_this": max(max_turns - turn_number, 0),
        "final_audit": final_audit,
    }


def next_step(missing_data: list[str], *, final_audit: bool) -> str:
    """Choose a compact stage-specific instruction for the next model action."""
    if final_audit:
        return "Run the systematic final gap audit and return structured output."
    if any("deep funded project" in item for item in missing_data):
        return (
            "Build one deeply evidenced funded-project chain before researching "
            "additional examples."
        )
    return "Research the highest-value unresolved item using an authoritative source."


def research_stage(missing_data: list[str]) -> str:
    """Describe the current research priority without controlling model content."""
    if any("deep funded project" in item for item in missing_data):
        return "deep_funded_project"
    if missing_data:
        return "required_coverage"
    return "final_gap_audit"


def find_missing_data(
    result: FundingOpportunityResearchResult,
    *,
    request: FundingOpportunityResearchRequest,
) -> list[str]:
    """List unresolved coverage targets; this does not judge factual correctness."""
    opportunity = result.opportunity
    missing: list[str] = []
    scalar_targets = (
        ("opportunity.funder_type", opportunity.funder_type),
        ("opportunity.funder_region", opportunity.funder_region),
        ("opportunity.finance_route", opportunity.finance_route),
        ("opportunity.instrument_type", opportunity.instrument_type),
        ("opportunity.region_scope", opportunity.region_scope),
        ("opportunity.live_status", opportunity.live_status),
        ("opportunity.status", opportunity.status),
    )
    for target_path, value in scalar_targets:
        if not value and not gap_covers(result, target_path):
            missing.append(f"Resolve {target_path} or record a precise gap.")

    if (
        opportunity.application_template is None
        and not gap_covers(result, "opportunity.application_template")
    ):
        suffix = " from the supplied URL" if request.application_template_url else ""
        missing.append(
            "Resolve opportunity.application_template"
            f"{suffix}, or record that no public template was found."
        )

    criterion_types = {item.criterion_type.lower() for item in opportunity.criteria}
    if not opportunity.criteria and not gap_covers(result, "opportunity.criteria"):
        missing.append("Find eligibility and selection criteria, or record precise gaps.")
    else:
        if not any("eligib" in value for value in criterion_types) and not gap_covers(
            result, "opportunity.criteria.eligibility"
        ):
            missing.append("Find at least one eligibility criterion or record a gap.")
        if not any(
            token in value
            for value in criterion_types
            for token in ("select", "evaluat", "assess")
        ) and not gap_covers(result, "opportunity.criteria.selection"):
            missing.append("Find selection/evaluation criteria or record a gap.")

    if not opportunity.funded_projects and not gap_covers(
        result, "opportunity.funded_projects"
    ):
        missing.append("Find at least one officially documented funded project.")
    if not has_deep_project(result) and not gap_covers(
        result, "opportunity.deep_funded_project"
    ):
        missing.append(
            "Build one deep funded project linking its project record, at least one "
            "action, and its funding relationship."
        )
    if not opportunity.financial_amounts and not gap_covers(
        result, "opportunity.financial_amounts"
    ):
        missing.append(
            "Capture monetary facts with explicit amount_kind, currency, timing, "
            "status, and project/action linkage, or record a gap."
        )

    source_types = [item.source_type.lower() for item in result.source_assessments]
    source_roles = (
        (
            "sources.guidance_or_eligibility",
            ("guidance", "eligib", "criteria", "faq", "application"),
            "Capture and classify authoritative eligibility or application guidance.",
        ),
        (
            "sources.funded_project_evidence",
            ("project", "award", "annual_report", "portfolio", "completion"),
            "Capture an official funded-project, award, portfolio, or annual report source.",
        ),
    )
    for target_path, tokens, instruction in source_roles:
        if not any(token in source_type for source_type in source_types for token in tokens):
            if not gap_covers(result, target_path):
                missing.append(instruction)

    if not result.evidence and not gap_covers(result, "evidence"):
        missing.append("Retain field evidence for populated non-seed facts.")
    return missing


def has_deep_project(result: FundingOpportunityResearchResult) -> bool:
    """Return whether one project has both an action and funding relationship."""
    opportunity = result.opportunity
    action_projects = {item.project_ref for item in opportunity.funded_project_actions}
    funding_projects = {
        item.project_ref for item in opportunity.funding_links if item.project_ref
    }
    funded_action_refs = {
        item.action_ref for item in opportunity.funding_links if item.action_ref
    }
    for project in opportunity.funded_projects:
        project_actions = {
            action.action_ref
            for action in opportunity.funded_project_actions
            if action.project_ref == project.project_ref
        }
        if project.project_ref in action_projects and (
            project.project_ref in funding_projects
            or bool(project_actions & funded_action_refs)
        ):
            return True
    return False


def gap_covers(result: FundingOpportunityResearchResult, target_path: str) -> bool:
    """Treat an explicit gap at or below a coverage target as investigated."""
    return any(
        gap.target_path == target_path
        or gap.target_path.startswith(f"{target_path}.")
        or gap.target_path.startswith(f"{target_path}[")
        for gap in result.gaps
    )


def summarize_tool_result(
    tool_name: str,
    result: dict[str, JsonValue],
) -> str:
    """Create a compact trace description without duplicating source content."""
    if result.get("error"):
        return str(result["error"])
    if tool_name == "firecrawl_search":
        results = result.get("results")
        count = len(results) if isinstance(results, list) else 0
        return f"Returned {count} search results."
    if tool_name == "firecrawl_extract":
        extracted = result.get("extracted")
        keys = list(extracted) if isinstance(extracted, dict) else []
        return (
            f"Captured {result.get('source_ref')} and extracted keys: "
            f"{', '.join(keys) if keys else 'none'}."
        )
    return f"Captured {result.get('source_ref')}: {result.get('title') or 'untitled'}."
