"""Functions for seed capture and the bounded CNB research agent loop."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.models.cnb.research import (
    AgentTurn,
    FundedProjectResearchResult,
    FunderProfileResearchResult,
    FunderResearchResult,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundingOpportunityResearchResultRow,
    ResearchGap,
)
from app.models.cnb.research_prompt import ResearchPromptResult
from app.services.cnb.research_bundle import (
    convert_agent_result,
    evidence_covers,
    exclude_target_project_self_matches,
    material_paths,
    uncovered_material_paths,
)
from app.services.cnb.research_prompt import (
    model_field_path,
    model_research_state,
    restore_research_state,
)
from app.tools.firecrawl import (
    FIRECRAWL_TOOL_DEFINITIONS,
    FirecrawlClient,
    FirecrawlError,
    execute_firecrawl_tool,
)
from app.utils.concept_note_context import omit_context_identifiers
from openai import OpenAI
from pydantic import JsonValue, ValidationError

logger = logging.getLogger(__name__)
TARGET_FUNDED_PROJECTS_GAP_PATH = "funded_projects.target_funded_projects"
MAX_STRUCTURED_OUTPUT_RETRIES = 2

FINAL_GAP_AUDIT = (
    "Before returning the final object, systematically audit: award minima and "
    "maxima; currencies; criterion weights and hard gates; selection timing and "
    "rates; co-financing; application-template availability; awarded amounts and "
    "award years; funded-project interventions; downstream financing status; "
    "published pipeline evidence; and source-license status. Preserve unknown values "
    "as null or empty and add precise ResearchGap entries."
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
    # Build the deterministic seed set supplied by the caller.
    seeds = [
        ("funder", str(request.funder_url)),
        ("program", str(request.program_url)),
    ]
    if request.application_template_url is not None:
        seeds.append(("application_template", str(request.application_template_url)))

    # Capture every seed outcome in both the model input and the audit trace.
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
    # Initialize the validated working dossier and first-turn payload.
    current_filled_object = exclude_target_project_self_matches(
        request=request,
        result=request.current_filled_object or empty_result(request),
    )
    missing_data = find_missing_data(
        current_filled_object,
        request=request,
        captured_source_refs={
            source.source_ref for source in firecrawl.captured_sources
        },
    )
    research_request = omit_context_identifiers(
        request.model_dump(mode="json", exclude={"current_filled_object", "max_turns"})
    )
    if research_request.get("target_project"):
        research_request["target_project"].pop("funder_scope", None)
        research_request["target_project"].pop("limit", None)
    current_input: str | list[dict[str, JsonValue]] = json.dumps(
        {
            "research_request": research_request,
            "current_filled_object": model_research_state(
                current_filled_object, firecrawl.captured_sources
            ).model_dump(mode="json"),
            "seed_sources": omit_context_identifiers(seed_sources),
            "missing_data": [
                model_field_path(item, current_filled_object) for item in missing_data
            ],
            "turn_budget": turn_budget(
                turn_number=1,
                max_turns=request.max_turns,
                final_audit=request.max_turns == 1,
            ),
            "research_stage": research_stage(missing_data),
            "final_gap_audit": (FINAL_GAP_AUDIT if request.max_turns == 1 else None),
        },
        ensure_ascii=False,
    )
    previous_response_id: str | None = None
    finalizing_for_coverage = False

    # Run bounded discovery turns, reserving the last turn for a no-tools audit.
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
                    captured_sources=firecrawl.captured_sources,
                )
            )

        # Build the Responses API request from code-owned turn state.
        request_kwargs: dict[str, object] = {
            "model": model_name,
            "reasoning": {"effort": reasoning_effort},
            "instructions": prompt,
            "input": current_input,
            "text_format": ResearchPromptResult,
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
        # Repair transient schema-invalid output without spending another agent turn.
        parse_attempt = 0
        restored_result = None
        while True:
            try:
                response = openai_client.responses.parse(**request_kwargs)
                if response.output_parsed is not None and not any(
                    item.type == "function_call" for item in response.output
                ):
                    restored_result = restore_research_state(
                        response.output_parsed,
                        current_filled_object,
                        firecrawl.captured_sources,
                    )
                break
            except ValueError as exc:
                if (
                    isinstance(exc, ValidationError)
                    and exc.title != ResearchPromptResult.__name__
                ) or parse_attempt >= MAX_STRUCTURED_OUTPUT_RETRIES:
                    raise
                parse_attempt += 1
                logger.warning(
                    "CNB research model returned invalid structured output on "
                    "turn %s; correction retry %s/%s",
                    turn_number,
                    parse_attempt,
                    MAX_STRUCTURED_OUTPUT_RETRIES,
                )
                trace.append(
                    AgentTurn(
                        turn=turn_number,
                        action="structured_output_retry",
                        query_or_url="",
                        result_summary=(
                            "Structured output validation failed; correction retry "
                            f"{parse_attempt}/{MAX_STRUCTURED_OUTPUT_RETRIES} stayed "
                            "within the current turn."
                        ),
                    )
                )
                request_kwargs["input"] = structured_output_retry_input(
                    current_input=current_input,
                    validation_error=exc,
                )
                request_kwargs.pop("tools", None)
                request_kwargs.pop("parallel_tool_calls", None)
        tool_calls = [item for item in response.output if item.type == "function_call"]

        # Accept structured checkpoints and decide whether another turn is useful.
        if not tool_calls:
            if response.output_parsed is None:
                raise RuntimeError(
                    "Research model returned neither a tool call nor structured output"
                )
            captured_source_refs = {
                source.source_ref for source in firecrawl.captured_sources
            }
            current_filled_object = preserve_evidence_qualified_funded_projects(
                previous_result=current_filled_object,
                candidate_result=restored_result,
                captured_source_refs=captured_source_refs,
                target_funded_projects=request.target_funded_projects,
            )
            current_filled_object = exclude_target_project_self_matches(
                request=request,
                result=current_filled_object,
            )
            missing_data = find_missing_data(
                current_filled_object,
                request=request,
                captured_source_refs=captured_source_refs,
            )
            trace.append(
                AgentTurn(
                    turn=turn_number,
                    action=(
                        "final_gap_audit" if is_final_audit else "structured_candidate"
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
                        "coverage_complete" if not missing_data else "turn_limit"
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

        # Execute model-selected tools and return their outputs on the next turn.
        tool_outputs = execute_tool_calls(
            tool_calls=tool_calls,
            turn_number=turn_number,
            firecrawl=firecrawl,
            trace=trace,
        )
        previous_response_id = response.id
        current_input = tool_outputs

    raise RuntimeError("Research model exhausted turns without a structured result")


def structured_output_retry_input(
    *,
    current_input: str | list[dict[str, JsonValue]],
    validation_error: ValueError,
) -> str | list[dict[str, JsonValue]]:
    """Add a compact correction instruction for a schema-invalid model result."""
    errors = (
        validation_error.errors(include_url=False, include_input=False)
        if isinstance(validation_error, ValidationError)
        else [{"loc": (), "msg": str(validation_error)}]
    )
    error_lines = []
    for error in errors:
        location = ".".join(str(part) for part in error["loc"]) or "result"
        error_lines.append(f"- {location}: {error['msg']}")
    error_details = "\n".join(error_lines)
    correction = (
        "<structured_output_correction>\n"
        "The previous response for this same agent turn failed schema validation.\n"
        "Validation errors:\n"
        f"{error_details}\n"
        "Return one complete corrected ResearchPromptResult. Use public source URLs "
        "and zero-based array positions, never identifiers. Do not call tools. This correction "
        "retry does not consume another agent turn or change the turn budget.\n"
        "</structured_output_correction>"
    )
    if isinstance(current_input, str):
        return f"{current_input}\n\n{correction}"
    return [*current_input, {"role": "user", "content": correction}]


def preserve_evidence_qualified_funded_projects(
    *,
    previous_result: FundingOpportunityResearchResult,
    candidate_result: FundingOpportunityResearchResult,
    captured_source_refs: set[str],
    target_funded_projects: int,
) -> FundingOpportunityResearchResult:
    """Restore omitted rows with only facts supported by current-run evidence."""
    candidate_project_refs = {
        project.funded_project_ref for project in candidate_result.funded_projects
    }
    omitted_projects = [
        project
        for project in previous_result.funded_projects
        if project.funded_project_ref not in candidate_project_refs
    ]
    if not omitted_projects:
        return candidate_result

    # Derive material paths with the same rules used by final bundle validation.
    (
        funder,
        funding_opportunities,
        funded_projects,
        funder_templates,
        funder_criteria,
    ) = convert_agent_result(previous_result)
    previous_material_paths = list(
        material_paths(
            funder=funder,
            funding_opportunities=funding_opportunities,
            funded_projects=funded_projects,
            funder_templates=funder_templates,
            funder_criteria=funder_criteria,
        )
    )

    # Require a supported project name, then retain only supported optional facts.
    restored_projects: list[FundedProjectResearchResult] = []
    restored_evidence = []
    for project in omitted_projects:
        row_path = f"funded_projects[{project.funded_project_ref}]"
        name_path = f"{row_path}.name"
        row_material_paths = [
            path
            for path in previous_material_paths
            if path.startswith(f"{row_path}.") or path.startswith(f"{row_path}[")
        ]
        qualifying_evidence = [
            evidence
            for evidence in previous_result.evidence
            if evidence.funded_project_ref == project.funded_project_ref
            and evidence.source_ref in captured_source_refs
            and bool(evidence.quote_or_summary.strip())
            and (
                evidence.target_path == row_path
                or evidence.target_path.startswith(f"{row_path}.")
                or evidence.target_path.startswith(f"{row_path}[")
            )
        ]
        evidence_paths = {evidence.target_path for evidence in qualifying_evidence}
        parent_evidence = row_path in evidence_paths
        if not project.name.strip() or not (
            parent_evidence or name_path in evidence_paths
        ):
            continue

        retained_material_paths = {
            path
            for path in row_material_paths
            if path in evidence_paths
        }
        project_data = {
            "funded_project_ref": project.funded_project_ref,
            "funder_ref": project.funder_ref,
            "name": project.name,
        }
        previous_project_data = project.model_dump(mode="python")
        for field_name in FundedProjectResearchResult.model_fields:
            field_path = f"{row_path}.{field_name}"
            if field_path in retained_material_paths:
                project_data[field_name] = previous_project_data[field_name]
        restored_projects.append(
            FundedProjectResearchResult.model_validate(project_data)
        )

        relevant_evidence_paths = {
            row_path,
            name_path,
            *retained_material_paths,
        }
        restored_evidence.extend(
            evidence
            for evidence in qualifying_evidence
            if evidence.target_path in relevant_evidence_paths
        )

    if not restored_projects:
        return candidate_result

    # Re-key retained evidence deterministically if the candidate reused an ID.
    used_evidence_refs = {
        evidence.evidence_ref for evidence in candidate_result.evidence
    }
    rekeyed_evidence = []
    for evidence in restored_evidence:
        evidence_ref = evidence.evidence_ref
        if evidence_ref in used_evidence_refs:
            suffix = 1
            while f"{evidence_ref}-retained-{suffix}" in used_evidence_refs:
                suffix += 1
            evidence_ref = f"{evidence_ref}-retained-{suffix}"
            evidence = evidence.model_copy(update={"evidence_ref": evidence_ref})
        used_evidence_refs.add(evidence_ref)
        rekeyed_evidence.append(evidence)

    # Restore assessments needed to classify the retained current-run evidence.
    retained_source_refs = {evidence.source_ref for evidence in rekeyed_evidence}
    candidate_assessment_refs = {
        assessment.source_ref for assessment in candidate_result.source_assessments
    }
    restored_assessments = [
        assessment
        for assessment in previous_result.source_assessments
        if assessment.source_ref in retained_source_refs
        and assessment.source_ref not in candidate_assessment_refs
    ]

    # Validate the merged checkpoint against all project and evidence invariants.
    merged_data = candidate_result.model_dump(mode="python")
    merged_data["funded_projects"].extend(
        project.model_dump(mode="python") for project in restored_projects
    )
    merged_data["evidence"].extend(
        evidence.model_dump(mode="python") for evidence in rekeyed_evidence
    )
    merged_data["source_assessments"].extend(
        assessment.model_dump(mode="python") for assessment in restored_assessments
    )
    # Clear the shortfall only when the merged checkpoint actually reaches its target.
    if len(merged_data["funded_projects"]) >= target_funded_projects:
        merged_data["gaps"] = [
            gap
            for gap in merged_data["gaps"]
            if gap["target_path"] != TARGET_FUNDED_PROJECTS_GAP_PATH
        ]
    return FundingOpportunityResearchResult.model_validate(merged_data)


def empty_result(
    request: FundingOpportunityResearchRequest,
) -> FundingOpportunityResearchResult:
    """Create the seed-preserving starting object shown to the research model."""
    return FundingOpportunityResearchResult(
        funder=FunderResearchResult(
            funder_ref="funder-001",
            name=request.funder_name,
            profile=FunderProfileResearchResult(),
        ),
        funding_opportunities=[
            FundingOpportunityResearchResultRow(
                funding_opportunity_ref="opportunity-001",
                funder_ref="funder-001",
                name=request.program_name,
            )
        ],
        funded_projects=[],
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
        # Decode and dispatch one explicitly registered tool call.
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

        # Retain a compact trace row and the matching Responses API output.
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
                "output": json.dumps(omit_context_identifiers(tool_result), ensure_ascii=False),
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
    captured_sources: list[object] | None = None,
) -> dict[str, JsonValue]:
    """Build the explicit progress, missing-data, and remaining-turn reminder."""
    # Derive the code-owned budget and final-audit instruction.
    budget = turn_budget(
        turn_number=turn_number,
        max_turns=max_turns,
        final_audit=final_audit,
    )
    missing_lines = (
        "\n".join(
            f"- {model_field_path(item, current_filled_object)}"
            for item in missing_data
        )
        or "- none"
    )
    final_instruction = (
        f"\n<final_gap_audit>{FINAL_GAP_AUDIT}</final_gap_audit>" if final_audit else ""
    )

    # Render the current dossier state as one user-context message.
    content = (
        "<current_filled_object>\n"
        f"{model_research_state(current_filled_object, captured_sources or []).model_dump_json(indent=2)}\n"
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
    if any("distinct funded-project rows" in item for item in missing_data):
        return (
            "Stay in breadth discovery until the funded-project target is met or "
            "a precise target-count gap is recorded."
        )
    if any(
        "deep funded project" in item
        or "complete funded-project row" in item
        for item in missing_data
    ):
        return (
            "Build one deeply evidenced funded-project chain before researching "
            "additional examples."
        )
    return "Research the highest-value unresolved item using an authoritative source."


def research_stage(missing_data: list[str]) -> str:
    """Describe the current research priority without controlling model content."""
    if any("distinct funded-project rows" in item for item in missing_data):
        return "breadth_funded_projects"
    if any(
        "deep funded project" in item
        or "complete funded-project row" in item
        for item in missing_data
    ):
        return "deep_funded_project"
    if missing_data:
        return "required_coverage"
    return "final_gap_audit"


def find_missing_data(
    result: FundingOpportunityResearchResult,
    *,
    request: FundingOpportunityResearchRequest,
    captured_source_refs: set[str],
) -> list[str]:
    """List unresolved coverage targets using current-run source provenance."""
    funder = result.funder
    opportunity = result.funding_opportunities[0]
    opportunity_path = (
        f"funding_opportunities[{opportunity.funding_opportunity_ref}]"
    )
    missing: list[str] = []

    # Check the core scalar opportunity fields.
    scalar_targets = (
        ("funder.funder_type", funder.funder_type),
        ("funder.region", funder.region),
        (f"{opportunity_path}.finance_route", opportunity.finance_route),
        (f"{opportunity_path}.instrument_type", opportunity.instrument_type),
        (f"{opportunity_path}.region_scope", opportunity.region_scope),
        (f"{opportunity_path}.status", opportunity.status),
    )
    for target_path, value in scalar_targets:
        if not value and not gap_covers(result, target_path):
            missing.append(f"Resolve {target_path} or record a precise gap.")

    # Require a template decision and both eligibility and selection coverage.
    if not result.funder_templates and not gap_covers(result, "funder_templates"):
        suffix = " from the supplied URL" if request.application_template_url else ""
        missing.append(
            "Resolve funder_templates"
            f"{suffix}, or record that no public template was found."
        )

    criterion_types = {item.criterion_type.lower() for item in result.funder_criteria}
    if not result.funder_criteria and not gap_covers(result, "funder_criteria"):
        missing.append(
            "Find eligibility and selection criteria, or record precise gaps."
        )
    else:
        if not any("eligib" in value for value in criterion_types) and not gap_covers(
            result, "funder_criteria.eligibility"
        ):
            missing.append("Find at least one eligibility criterion or record a gap.")
        if not any(
            token in value
            for value in criterion_types
            for token in ("select", "evaluat", "assess")
        ) and not gap_covers(result, "funder_criteria.selection"):
            missing.append("Find selection/evaluation criteria or record a gap.")

    # Require one complete funded-project row and explicit monetary coverage.
    funded_project_refs = {
        item.funded_project_ref for item in result.funded_projects
    }
    if len(funded_project_refs) < request.target_funded_projects and not gap_covers(
        result, TARGET_FUNDED_PROJECTS_GAP_PATH
    ):
        if request.target_funded_projects == 1:
            missing.append("Find at least one officially documented funded project.")
        else:
            missing.append(
                "Find officially documented distinct funded-project rows until the "
                f"target of {request.target_funded_projects} is met, or record a "
                f"precise gap at {TARGET_FUNDED_PROJECTS_GAP_PATH}."
            )
    for project in result.funded_projects:
        target_path = (
            f"funded_projects[{project.funded_project_ref}].reported_funder_name"
        )
        if not project.reported_funder_name and not gap_covers(result, target_path):
            missing.append(
                f"Resolve {target_path} from a project source or record a precise gap."
            )
    if not has_deep_project(result) and not gap_covers(
        result, "funded_projects.deep_funded_project"
    ):
        missing.append(
            "Build one complete funded-project row with interventions, summary, award "
            "amount, currency, award year when published, and status."
        )
    has_monetary_fact = any(
        value is not None
        for value in (opportunity.min_award, opportunity.max_award)
    ) or any(
        project.award_amount is not None for project in result.funded_projects
    )
    if not has_monetary_fact and not gap_covers(
        result, "funding_opportunities.financial_coverage"
    ):
        missing.append(
            "Capture opportunity award bounds or a funded-project award amount with "
            "currency, award year when published, and status, or record a gap."
        )

    # Confirm that authoritative guidance and funded-project sources were captured.
    source_types = [
        item.source_type.lower()
        for item in result.source_assessments
        if item.source_ref in captured_source_refs
    ]
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
        if not any(
            token in source_type for source_type in source_types for token in tokens
        ):
            if not gap_covers(result, target_path):
                missing.append(instruction)

    # Reconcile prior evidence with the sources captured during this run.
    retained_evidence = [
        item for item in result.evidence if item.source_ref in captured_source_refs
    ]
    prior_sources_by_target: dict[str, set[str]] = {}
    for item in result.evidence:
        if item.source_ref in captured_source_refs:
            continue
        prior_sources_by_target.setdefault(item.target_path, set()).add(item.source_ref)
    for target_path, source_refs in sorted(prior_sources_by_target.items()):
        missing.append(
            f"Revalidate {target_path} by recapturing or replacing prior-run "
            f"sources: {', '.join(sorted(source_refs))}."
        )

    # Require every populated material field to survive bundle provenance checks.
    (
        funder,
        funding_opportunities,
        funded_projects,
        funder_templates,
        funder_criteria,
    ) = convert_agent_result(result)
    prior_evidence_paths = set(prior_sources_by_target)
    for target_path in uncovered_material_paths(
        funder=funder,
        funding_opportunities=funding_opportunities,
        funded_projects=funded_projects,
        funder_templates=funder_templates,
        funder_criteria=funder_criteria,
        evidence=retained_evidence,
        gaps=result.gaps,
    ):
        if evidence_covers(target_path, prior_evidence_paths):
            continue
        missing.append(
            f"Support {target_path} with evidence from a source captured in this "
            "run, or record a precise gap."
        )

    if not retained_evidence and not gap_covers(result, "evidence"):
        missing.append("Retain field evidence for populated non-seed facts.")
    return missing


def has_deep_project(result: FundingOpportunityResearchResult) -> bool:
    """Return whether one funded-project row contains action and award context."""
    return any(
        bool(project.interventions)
        and bool(project.summary)
        and project.award_amount is not None
        and bool(project.currency)
        and bool(project.status)
        for project in result.funded_projects
    )


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
