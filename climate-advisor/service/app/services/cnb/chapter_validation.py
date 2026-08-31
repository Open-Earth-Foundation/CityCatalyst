"""Two-pass, non-truncating validation for one Concept Note chapter."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Any, Literal, cast
from uuid import UUID

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings, get_settings
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_chapter_validation import (
    ChapterCompletenessValidationOutput,
    ChapterConsistencyValidationOutput,
    ChapterValidationChapter,
    ChapterValidationCheck,
    ChapterValidationCheckKey,
    ChapterValidationCheckStatus,
    ChapterValidationDecision,
    ChapterValidationEvidenceLink,
    ChapterValidationFinding,
    ChapterValidationFindingCategory,
    ChapterValidationFindingDraft,
    ChapterValidationGap,
    ChapterValidationRequest,
    ChapterValidationTemplate,
)
from app.persistence.concept_notes.workspace import WorkspaceValidationContext
from app.services.openrouter_client import build_openrouter_client_options
from app.utils.prompt_budget import count_prompt_tokens
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

ValidationPass = Literal["completeness", "consistency"]
ValidationPassOutput = (
    ChapterCompletenessValidationOutput | ChapterConsistencyValidationOutput
)
ValidationPassRunner = Callable[
    [ValidationPass, dict[str, Any]],
    Awaitable[ValidationPassOutput],
]

_CHECK_LABELS: dict[ChapterValidationCheckKey, str] = {
    "required_content": "Required content",
    "template_constraints": "Template constraints",
    "blocking_gaps": "Open gaps",
    "evidence_citations": "Evidence and citations",
    "internal_consistency": "Internal logic",
    "cross_chapter_consistency": "Cross-chapter consistency",
}
_CHECK_ORDER = tuple(_CHECK_LABELS)
_STATUS_RANK: dict[ChapterValidationCheckStatus, int] = {
    "pass": 0,
    "warning": 1,
    "fail": 2,
}
_BLOCKING_GAP_SEVERITIES = {"missing_information", "critical", "blocking"}
_SCOPE_CONFLICT_MESSAGE = (
    "The target and related chapter define incompatible scope: one includes "
    "delivery of current works while the other explicitly excludes completed or "
    "current construction and commissioning works."
)
_SCOPE_CONFLICT_ACTION = (
    "Align both chapters on one explicit future eligible scope and consistently "
    "separate it from completed, construction, and commissioning works."
)
_INTERNAL_SCOPE_CONFLICT_MESSAGE = (
    "The target defines the proposed measure as delivery of current works while "
    "also stating that construction or commissioning is already at a late stage."
)
_INTERNAL_SCOPE_CONFLICT_ACTION = (
    "Replace current works with a distinct future residual or follow-on scope, "
    "schedule, and cost."
)
_AFFIRMATIVE_SCOPE_PATTERNS = (
    re.compile(
        r"\b(?:the\s+)?proposed measure\s+(?:is|will be)\s+(?:the\s+)?"
        r"delivery of\b.{0,240}\b(?:route|construction|works?|infrastructure|"
        r"building|installation)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:proposed measure|supported scope|funding scope|EUCF support)\b"
        r".{0,120}\b(?:explicitly\s+)?(?:includes?|covers?|funds?)\b.{0,160}"
        r"\b(?:(?:ongoing|current)\s+(?:construction|works?|commissioning)|"
        r"(?:construction|works?|commissioning)\s+(?:ongoing|current|underway))\b",
        re.IGNORECASE,
    ),
)
_EXCLUSION_SCOPE_PATTERNS = (
    re.compile(
        r"\b(?:must|will)\s+not\s+fund\b.{0,240}"
        r"\b(?:works?|construction|commissioning)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:explicitly\s+)?exclud(?:e|es|ed|ing)\b.{0,240}"
        r"\b(?:works?|construction|commissioning)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bexplicit exclusion of\b.{0,240}"
        r"\b(?:works?|construction|commissioning)\b",
        re.IGNORECASE,
    ),
)
_LATE_WORKS_PATTERNS = (
    re.compile(
        r"\blate(?:-stage)?\s+construction\s+and\s+commissioning\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bconstruction\b.{0,120}\b(?:\d{1,3}\s*%\s+complete|"
        r"(?:almost|nearly)\s+complete)\b.{0,160}\bcommissioning\b.{0,80}"
        r"\b(?:underway|ongoing|continues?|continued|continuing|in progress)\b",
        re.IGNORECASE,
    ),
)


class ChapterValidationError(Exception):
    """Stable failure raised without producing a persistence-ready decision."""

    code = "chapter_validation_failed"
    status_code = 502


class ChapterValidationInputTooLargeError(ChapterValidationError):
    """A complete target or comparison chapter cannot fit without truncation."""

    code = "chapter_validation_input_too_large"
    status_code = 422


class ChapterValidationModelOutputError(ChapterValidationError):
    """The model returned invalid structured output or chapter references."""

    code = "chapter_validation_model_output_invalid"
    status_code = 502


def build_chapter_validation_request(
    context: WorkspaceValidationContext,
    *,
    template: ApplicationContextTemplate | None,
) -> ChapterValidationRequest:
    """Adapt one repository snapshot and application template to core inputs."""
    template_context = None
    if template is not None:
        template_context = ChapterValidationTemplate(
            template_id=template.id,
            name=template.name,
            output_format=template.output_format,
            chapter_schema=template.chapter_schema,
            required_fields=template.required_fields,
        )
    return ChapterValidationRequest(
        target_chapter_id=context.target.chapter_id,
        validation_input_fingerprint=context.fingerprint,
        chapters=[
            ChapterValidationChapter(
                chapter_id=chapter.chapter_id,
                template_section_id=chapter.chapter_ref,
                title=chapter.title,
                position=chapter.position,
                required=chapter.required,
                body_markdown=chapter.body_markdown,
                revision_number=chapter.revision_number,
            )
            for chapter in context.chapters
        ],
        template=template_context,
        open_gaps=[
            ChapterValidationGap(
                severity=gap.severity,
                reason=gap.reason,
                field_key=gap.field_key,
            )
            for gap in context.open_gaps
        ],
        evidence_links=[
            ChapterValidationEvidenceLink(
                selected_source_label=evidence.selected_source_label,
                source_location=evidence.source_location,
                claim_ref=evidence.claim_ref,
                quote_or_summary=evidence.quote_or_summary,
            )
            for evidence in context.evidence_links
        ],
    )


class ConceptNoteChapterValidationService:
    """Run completeness first, then target-versus-document consistency checks."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        run_pass: ValidationPassRunner | None = None,
        runner: Any = Runner,
    ) -> None:
        self._settings = settings or get_settings()
        self._run_pass_override = run_pass
        self._runner = runner

    async def validate(
        self,
        request: ChapterValidationRequest,
    ) -> ChapterValidationDecision:
        """Return a persistence-ready decision without writing workspace state."""
        # Step 1: resolve the immutable target snapshot and empty fast path.
        target = next(
            chapter
            for chapter in request.chapters
            if chapter.chapter_id == request.target_chapter_id
        )
        if not (target.body_markdown or "").strip():
            return _empty_chapter_decision(request)

        model_config = self._settings.llm.models.cnb_chapter_validator
        prompts = self._settings.llm.prompts
        completeness_prompt = prompts.get_prompt("cnb_chapter_validation_completeness")
        consistency_prompt = prompts.get_prompt("cnb_chapter_validation_consistency")
        budget = self._settings.llm.generation.prompt_budget.cnb_validation
        tokenizer = self._settings.llm.generation.prompt_budget.tokenizer_encoding
        target_payload = target.model_dump(mode="json")
        completeness_payload = {
            "target_chapter": target_payload,
            "template": (
                request.template.model_dump(mode="json")
                if request.template is not None
                else None
            ),
            "open_gaps": [gap.model_dump(mode="json") for gap in request.open_gaps],
            "evidence_links": [
                evidence.model_dump(mode="json") for evidence in request.evidence_links
            ],
        }
        _require_prompt_fit(
            prompt=completeness_prompt,
            payload=completeness_payload,
            output_schema=ChapterCompletenessValidationOutput.model_json_schema(),
            model=model_config.name,
            fallback_encoding=tokenizer,
            max_prompt_tokens=budget.max_prompt_tokens,
            description="target chapter completeness input",
        )

        logger.info(
            "Starting Concept Note chapter validation target_chapter_id=%s chapters=%s",
            request.target_chapter_id,
            len(request.chapters),
        )

        # Step 2: execute both passes with one client and no persistence side effects.
        client: AsyncOpenAI | None = None
        run_pass = self._run_pass_override
        if run_pass is None:
            options = build_openrouter_client_options(
                self._settings,
                missing_api_key_message=(
                    "OpenRouter API key is required for Concept Note validation"
                ),
                error_cls=ChapterValidationError,
            )
            client = AsyncOpenAI(**options.kwargs)

            async def configured_runner(
                phase: ValidationPass,
                payload: dict[str, Any],
            ) -> ValidationPassOutput:
                return await self._run_configured_pass(
                    client=cast(AsyncOpenAI, client),
                    phase=phase,
                    payload=payload,
                )

            run_pass = configured_runner

        try:
            completeness = await _invoke_pass(
                run_pass,
                "completeness",
                completeness_payload,
                ChapterCompletenessValidationOutput,
            )
            _validate_completeness_findings(
                completeness,
                target_chapter_id=request.target_chapter_id,
            )
            _ensure_non_pass_findings(
                completeness,
                target_chapter_id=request.target_chapter_id,
            )
            completeness_result = completeness.model_dump(mode="json")

            other_chapters = sorted(
                (
                    chapter
                    for chapter in request.chapters
                    if chapter.chapter_id != request.target_chapter_id
                ),
                key=lambda chapter: (chapter.position, str(chapter.chapter_id)),
            )
            consistency_batches = _build_consistency_batches(
                target=target_payload,
                completeness=completeness_result,
                other_chapters=[
                    chapter.model_dump(mode="json") for chapter in other_chapters
                ],
                prompt=consistency_prompt,
                model=model_config.name,
                fallback_encoding=tokenizer,
                max_prompt_tokens=budget.max_prompt_tokens,
            )

            consistency_outputs: list[ChapterConsistencyValidationOutput] = []
            for batch in consistency_batches:
                payload = {
                    "target_chapter": target_payload,
                    "completeness_result": completeness_result,
                    "compared_chapters": batch,
                }
                output = await _invoke_pass(
                    run_pass,
                    "consistency",
                    payload,
                    ChapterConsistencyValidationOutput,
                )
                _validate_consistency_findings(
                    output,
                    target_chapter_id=request.target_chapter_id,
                    compared_chapter_ids={
                        UUID(chapter["chapter_id"]) for chapter in batch
                    },
                )
                _ensure_non_pass_findings(
                    output,
                    target_chapter_id=request.target_chapter_id,
                )
                consistency_outputs.append(output)
        finally:
            if client is not None:
                await client.close()

        # Step 3: merge model findings with deterministic gap/evidence guardrails.
        findings = _merge_findings(
            request=request,
            completeness=completeness,
            consistency_outputs=consistency_outputs,
        )
        checks = _merge_checks(
            request=request,
            completeness=completeness,
            consistency_outputs=consistency_outputs,
            findings=findings,
        )
        status = _aggregate_status(checks, findings)

        logger.info(
            "Completed Concept Note chapter validation target_chapter_id=%s "
            "status=%s findings=%s consistency_batches=%s",
            request.target_chapter_id,
            status,
            len(findings),
            len(consistency_batches),
        )
        return ChapterValidationDecision(
            target_chapter_id=request.target_chapter_id,
            validated_revision_number=target.revision_number,
            validation_input_fingerprint=request.validation_input_fingerprint,
            status=status,
            checks=checks,
            findings=findings,
        )

    async def _run_configured_pass(
        self,
        *,
        client: AsyncOpenAI,
        phase: ValidationPass,
        payload: dict[str, Any],
    ) -> ValidationPassOutput:
        """Run one structured pass through the configured OpenRouter model."""
        model_config = self._settings.llm.models.cnb_chapter_validator
        if phase == "completeness":
            prompt_name = "cnb_chapter_validation_completeness"
            output_type: type[BaseModel] = ChapterCompletenessValidationOutput
            agent_name = "Concept Note chapter completeness validator"
        else:
            prompt_name = "cnb_chapter_validation_consistency"
            output_type = ChapterConsistencyValidationOutput
            agent_name = "Concept Note chapter consistency validator"

        agent = Agent(
            name=agent_name,
            instructions=self._settings.llm.prompts.get_prompt(prompt_name),
            model=OpenAIChatCompletionsModel(
                model=model_config.name,
                openai_client=client,
            ),
            model_settings=ModelSettings(
                temperature=0.0,
                include_usage=True,
                reasoning={"effort": model_config.reasoning_effort},
            ),
            output_type=output_type,
            tools=[],
        )
        result = await self._runner.run(
            agent,
            json.dumps(payload, ensure_ascii=False),
        )
        return cast(
            ValidationPassOutput,
            output_type.model_validate(result.final_output),
        )


async def _invoke_pass(
    run_pass: ValidationPassRunner,
    phase: ValidationPass,
    payload: dict[str, Any],
    output_type: type[BaseModel],
) -> ValidationPassOutput:
    """Coerce callback output and keep provider/parsing failures typed."""
    try:
        raw_output = await run_pass(phase, payload)
        return cast(ValidationPassOutput, output_type.model_validate(raw_output))
    except ChapterValidationError:
        raise
    except (ValidationError, ValueError, TypeError) as exc:
        raise ChapterValidationModelOutputError(
            f"Invalid {phase} validation output"
        ) from exc
    except Exception as exc:
        raise ChapterValidationError(f"{phase.title()} validation failed") from exc


def _build_consistency_batches(
    *,
    target: dict[str, Any],
    completeness: dict[str, Any],
    other_chapters: list[dict[str, Any]],
    prompt: str,
    model: str,
    fallback_encoding: str,
    max_prompt_tokens: int,
) -> list[list[dict[str, Any]]]:
    """Batch complete chapters greedily while never truncating document text."""

    def fits(chapters: list[dict[str, Any]]) -> bool:
        payload = {
            "target_chapter": target,
            "completeness_result": completeness,
            "compared_chapters": chapters,
        }
        token_count = count_prompt_tokens(
            [
                prompt,
                payload,
                ChapterConsistencyValidationOutput.model_json_schema(),
            ],
            model=model,
            fallback_encoding=fallback_encoding,
        )
        return token_count.tokens <= max_prompt_tokens

    # The target and first-pass output must fit even for an empty document.
    if not fits([]):
        raise ChapterValidationInputTooLargeError(
            "Target chapter consistency input exceeds the configured prompt budget"
        )
    if not other_chapters:
        return [[]]

    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for chapter in other_chapters:
        candidate = [*current, chapter]
        if fits(candidate):
            current = candidate
            continue
        if not current:
            raise ChapterValidationInputTooLargeError(
                "A complete comparison chapter exceeds the configured prompt budget"
            )
        batches.append(current)
        current = [chapter]
        if not fits(current):
            raise ChapterValidationInputTooLargeError(
                "A complete comparison chapter exceeds the configured prompt budget"
            )
    if current:
        batches.append(current)
    return batches


def _require_prompt_fit(
    *,
    prompt: str,
    payload: dict[str, Any],
    output_schema: dict[str, Any],
    model: str,
    fallback_encoding: str,
    max_prompt_tokens: int,
    description: str,
) -> None:
    """Reject an indivisible prompt instead of silently dropping content."""
    token_count = count_prompt_tokens(
        [prompt, payload, output_schema],
        model=model,
        fallback_encoding=fallback_encoding,
    )
    if token_count.tokens > max_prompt_tokens:
        raise ChapterValidationInputTooLargeError(
            f"{description.capitalize()} exceeds the configured prompt budget"
        )


def _validate_completeness_findings(
    output: ChapterCompletenessValidationOutput,
    *,
    target_chapter_id: UUID,
) -> None:
    """Reject pass-one findings that reference anything beyond the target."""
    for finding in output.findings:
        involved_ids = set(finding.involved_chapter_ids)
        if len(involved_ids) != len(finding.involved_chapter_ids) or involved_ids != {
            target_chapter_id
        }:
            raise ChapterValidationModelOutputError(
                "Completeness finding referenced an invalid chapter"
            )


def _validate_consistency_findings(
    output: ChapterConsistencyValidationOutput,
    *,
    target_chapter_id: UUID,
    compared_chapter_ids: set[UUID],
) -> None:
    """Reject hallucinated references and conflicts unrelated to the target."""
    allowed_ids = {target_chapter_id} | compared_chapter_ids
    for finding in output.findings:
        involved_ids = set(finding.involved_chapter_ids)
        if len(involved_ids) != len(finding.involved_chapter_ids):
            raise ChapterValidationModelOutputError(
                "Consistency finding contains duplicate chapter references"
            )
        if target_chapter_id not in involved_ids or not involved_ids <= allowed_ids:
            raise ChapterValidationModelOutputError(
                "Consistency finding referenced an invalid chapter"
            )
        if finding.category == "cross_chapter_conflict":
            if not (involved_ids - {target_chapter_id}):
                raise ChapterValidationModelOutputError(
                    "Cross-chapter finding did not reference a compared chapter"
                )
        elif involved_ids != {target_chapter_id}:
            raise ChapterValidationModelOutputError(
                "Internal consistency finding referenced another chapter"
            )


def _ensure_non_pass_findings(
    output: ValidationPassOutput,
    *,
    target_chapter_id: UUID,
) -> None:
    """Normalize target-only check summaries into actionable findings."""
    categories_by_check = {
        "required_content": {"missing_information", "unresolved_gap"},
        # A missing template field is often also ordinary missing information.
        # Accept that actionable finding instead of rejecting an otherwise
        # useful structured response solely because the model chose the
        # broader category.
        "template_constraints": {
            "missing_information",
            "template_constraint",
            "unresolved_gap",
        },
        "evidence_citations": {"evidence"},
        "internal_consistency": {"internal_conflict", "logic_error"},
        "cross_chapter_consistency": {"cross_chapter_conflict"},
    }
    finding_categories = {finding.category for finding in output.findings}
    fallback_findings: dict[
        ChapterValidationCheckKey,
        tuple[ChapterValidationFindingCategory, str],
    ] = {
        "required_content": (
            "missing_information",
            "Add or correct the required information described in this finding.",
        ),
        "template_constraints": (
            "template_constraint",
            "Revise the target chapter to satisfy the described template requirement.",
        ),
        "evidence_citations": (
            "evidence",
            "Link or add the supporting evidence described in this finding.",
        ),
        "internal_consistency": (
            "logic_error",
            "Revise the target chapter to resolve the described inconsistency.",
        ),
    }
    for check in output.checks:
        if check.status == "pass":
            continue
        if check.message is None:
            raise ChapterValidationModelOutputError(
                f"Non-pass check {check.key} has no summary message"
            )
        if finding_categories.intersection(categories_by_check[check.key]):
            continue
        if check.key == "cross_chapter_consistency":
            raise ChapterValidationModelOutputError(
                f"Non-pass check {check.key} has no actionable finding"
            )
        fallback = fallback_findings.get(check.key)
        if fallback is None:
            raise ChapterValidationModelOutputError(
                f"Non-pass check {check.key} cannot be normalized"
            )
        category, suggested_action = fallback
        output.findings.append(
            ChapterValidationFindingDraft(
                category=category,
                severity=(
                    "warning"
                    if check.status == "warning" or check.key == "evidence_citations"
                    else "blocking"
                ),
                message=check.message,
                suggested_action=suggested_action,
                involved_chapter_ids=[target_chapter_id],
            )
        )
        finding_categories.add(category)


def _merge_findings(
    *,
    request: ChapterValidationRequest,
    completeness: ChapterCompletenessValidationOutput,
    consistency_outputs: list[ChapterConsistencyValidationOutput],
) -> list[ChapterValidationFinding]:
    """Normalize policy-sensitive findings and remove batch duplicates."""
    # Persisted gaps are authoritative and appear once even if the model also
    # recognizes the same omission in chapter text.
    merged = _deterministic_gap_findings(request)
    for finding in completeness.findings:
        severity = finding.severity
        if finding.category in {"missing_information", "template_constraint"}:
            severity = "blocking"
        elif finding.category == "evidence":
            severity = "warning"
        public_finding = _public_finding(
            finding,
            phase="evidence" if finding.category == "evidence" else "completeness",
            severity=severity,
        )
        if not _finding_is_covered_by_open_gaps(public_finding, request.open_gaps):
            merged.append(public_finding)

    merged.extend(_deterministic_scope_findings(request))
    for output in consistency_outputs:
        merged.extend(
            _public_finding(finding, phase="consistency") for finding in output.findings
        )

    return _deduplicate_findings(merged)


def _finding_is_covered_by_open_gaps(
    finding: ChapterValidationFinding,
    gaps: list[ChapterValidationGap],
) -> bool:
    """Recognize a model paraphrase or summary of authoritative persisted gaps."""
    if finding.category not in {
        "missing_information",
        "template_constraint",
        "unresolved_gap",
    }:
        return False
    finding_text = _normalized_text(f"{finding.message} {finding.suggested_action}")
    finding_terms = _significant_terms(finding_text)
    gap_term_sets: list[set[str]] = []
    for gap in gaps:
        gap_text = _normalized_text(gap.reason)
        if gap_text in finding_text:
            return True
        gap_terms = _significant_terms(gap_text)
        gap_term_sets.append(gap_terms)
        required_gap_overlap = max(3, (len(gap_terms) * 3 + 4) // 5)
        if (
            len(gap_terms) >= 3
            and len(gap_terms & finding_terms) >= required_gap_overlap
        ):
            return True

    # Consolidated model summaries are duplicates when their own substantive
    # terms are already explained by the canonical gap set.
    all_gap_terms = set().union(*gap_term_sets) if gap_term_sets else set()
    required_finding_overlap = max(3, (len(finding_terms) * 3 + 3) // 4)
    return (
        len(finding_terms) >= 3
        and len(finding_terms & all_gap_terms) >= required_finding_overlap
    )


def _normalized_text(value: str) -> str:
    """Normalize punctuation and whitespace for concise finding comparison."""
    return " ".join(
        "".join(character if character.isalnum() else " " for character in value)
        .casefold()
        .split()
    )


def _significant_terms(value: str) -> set[str]:
    """Drop connective words before comparing a gap with a model paraphrase."""
    ignored = {
        "a",
        "add",
        "and",
        "absent",
        "confirm",
        "is",
        "missing",
        "or",
        "provide",
        "required",
        "the",
        "this",
        "to",
    }
    return {term for term in value.split() if term not in ignored}


def _deterministic_gap_findings(
    request: ChapterValidationRequest,
) -> list[ChapterValidationFinding]:
    """Convert every persisted open gap into a policy-owned finding."""
    findings: list[ChapterValidationFinding] = []
    for gap in request.open_gaps:
        normalized_severity = gap.severity.strip().lower()
        severity = (
            "blocking" if normalized_severity in _BLOCKING_GAP_SEVERITIES else "warning"
        )
        category = (
            "missing_information"
            if normalized_severity == "missing_information"
            else "unresolved_gap"
        )
        findings.append(
            ChapterValidationFinding(
                phase="completeness",
                category=category,
                severity=severity,
                message=f"Open gap: {gap.reason}",
                suggested_action=f"Resolve or confirm this gap: {gap.reason}",
                involved_chapter_ids=[request.target_chapter_id],
            )
        )
    return findings


def _deterministic_scope_findings(
    request: ChapterValidationRequest,
) -> list[ChapterValidationFinding]:
    """Find only explicit target-involved current-versus-future scope conflicts."""
    target = next(
        chapter
        for chapter in request.chapters
        if chapter.chapter_id == request.target_chapter_id
    )
    target_inclusion = _explicit_scope_inclusion(target.body_markdown)
    target_exclusion = _explicit_scope_exclusion(target.body_markdown)
    findings: list[ChapterValidationFinding] = []

    # A delivery definition conflicts internally with an explicit late-works state.
    late_works = _explicit_late_works_state(target.body_markdown)
    if target_inclusion is not None and late_works is not None:
        findings.append(
            ChapterValidationFinding(
                phase="consistency",
                category="internal_conflict",
                severity="blocking",
                message=_INTERNAL_SCOPE_CONFLICT_MESSAGE,
                suggested_action=_INTERNAL_SCOPE_CONFLICT_ACTION,
                involved_chapter_ids=[target.chapter_id],
                excerpts=[target_inclusion, late_works],
            )
        )

    # Compare only claims involving the target; conflicts between other chapters
    # belong to validation of those chapters instead.
    for chapter in request.chapters:
        if chapter.chapter_id == target.chapter_id:
            continue
        related_excerpt: str | None = None
        target_excerpt: str | None = None
        if target_inclusion is not None:
            related_excerpt = _explicit_scope_exclusion(chapter.body_markdown)
            target_excerpt = target_inclusion
        if related_excerpt is None and target_exclusion is not None:
            related_excerpt = _explicit_scope_inclusion(chapter.body_markdown)
            target_excerpt = target_exclusion
        if target_excerpt is None or related_excerpt is None:
            continue
        findings.append(
            ChapterValidationFinding(
                phase="consistency",
                category="cross_chapter_conflict",
                severity="blocking",
                message=_SCOPE_CONFLICT_MESSAGE,
                suggested_action=_SCOPE_CONFLICT_ACTION,
                involved_chapter_ids=[target.chapter_id, chapter.chapter_id],
                excerpts=[target_excerpt, related_excerpt],
            )
        )
    return findings


def _explicit_scope_inclusion(body_markdown: str | None) -> str | None:
    """Return a strong affirmative current-works scope claim, if present."""
    for sentence in _chapter_sentences(body_markdown):
        if re.search(
            r"\b(?:not|never)\s+(?:include|cover|fund)|\brather than\b|"
            r"\bexclud(?:e|es|ed|ing)\b",
            sentence,
            re.IGNORECASE,
        ):
            continue
        if any(pattern.search(sentence) for pattern in _AFFIRMATIVE_SCOPE_PATTERNS):
            return sentence
    return None


def _explicit_scope_exclusion(body_markdown: str | None) -> str | None:
    """Return an explicit exclusion of completed or current works, if present."""
    for sentence in _chapter_sentences(body_markdown):
        if any(pattern.search(sentence) for pattern in _EXCLUSION_SCOPE_PATTERNS):
            return sentence
        normalized = sentence.casefold()
        if "rather than" in normalized and any(
            phrase in normalized
            for phrase in (
                "already completed",
                "under construction",
                "being commissioned",
                "ongoing construction",
                "current works",
            )
        ):
            return sentence
    return None


def _explicit_late_works_state(body_markdown: str | None) -> str | None:
    """Return a narrow late-construction-and-commissioning statement."""
    for sentence in _chapter_sentences(body_markdown):
        if any(pattern.search(sentence) for pattern in _LATE_WORKS_PATTERNS):
            return sentence
    return None


def _chapter_sentences(body_markdown: str | None) -> list[str]:
    """Split Markdown into concise sentence excerpts without altering meaning."""
    if not body_markdown:
        return []
    sentences: list[str] = []
    for part in re.split(r"(?<=[.!?])\s+|[\r\n]+", body_markdown):
        sentence = " ".join(part.strip(" \t#>*_-").split())
        if sentence:
            sentences.append(sentence[:500])
    return sentences


def _public_finding(
    finding: ChapterValidationFindingDraft,
    *,
    phase: Literal["completeness", "consistency", "evidence"],
    severity: Literal["warning", "blocking"] | None = None,
) -> ChapterValidationFinding:
    """Attach the service-owned phase and any deterministic severity override."""
    return ChapterValidationFinding(
        phase=phase,
        category=finding.category,
        severity=severity or finding.severity,
        message=finding.message,
        suggested_action=finding.suggested_action,
        involved_chapter_ids=finding.involved_chapter_ids,
        excerpts=finding.excerpts,
    )


def _deduplicate_findings(
    findings: list[ChapterValidationFinding],
) -> list[ChapterValidationFinding]:
    """Keep the first stable occurrence of repeated batched findings."""
    unique: list[ChapterValidationFinding] = []
    seen: set[tuple[str, str, tuple[str, ...], str]] = set()
    for finding in findings:
        key = (
            finding.phase,
            finding.category,
            tuple(
                sorted(str(chapter_id) for chapter_id in finding.involved_chapter_ids)
            ),
            " ".join(finding.message.casefold().split()),
        )
        if key in seen:
            continue
        if any(_is_scope_paraphrase_of(finding, existing) for existing in unique):
            continue
        seen.add(key)
        unique.append(finding)
    return unique


def _is_scope_paraphrase_of(
    finding: ChapterValidationFinding,
    existing: ChapterValidationFinding,
) -> bool:
    """Recognize a model paraphrase of an earlier deterministic scope finding."""
    if set(finding.involved_chapter_ids) != set(existing.involved_chapter_ids):
        return False
    if existing.message == _SCOPE_CONFLICT_MESSAGE:
        if finding.category != "cross_chapter_conflict":
            return False
    elif existing.message == _INTERNAL_SCOPE_CONFLICT_MESSAGE:
        if finding.category not in {"internal_conflict", "logic_error"}:
            return False
    else:
        return False

    text = _normalized_text(f"{finding.message} {finding.suggested_action}")
    terms = set(text.split())
    return (
        bool(terms & {"construction", "commissioning", "works", "route"})
        and bool(
            terms & {"deliver", "delivery", "include", "includes", "measure", "scope"}
        )
        and bool(
            terms
            & {
                "already",
                "complete",
                "completed",
                "current",
                "exclude",
                "excludes",
                "follow",
                "future",
                "late",
                "ongoing",
                "residual",
                "underway",
            }
        )
    )


def _merge_checks(
    *,
    request: ChapterValidationRequest,
    completeness: ChapterCompletenessValidationOutput,
    consistency_outputs: list[ChapterConsistencyValidationOutput],
    findings: list[ChapterValidationFinding],
) -> list[ChapterValidationCheck]:
    """Merge fixed checks, applying deterministic policy as the final authority."""
    check_state: dict[
        ChapterValidationCheckKey,
        tuple[ChapterValidationCheckStatus, str | None],
    ] = {key: ("pass", None) for key in _CHECK_ORDER}
    for check in completeness.checks:
        status = check.status
        if check.key == "evidence_citations" and status == "fail":
            status = "warning"
        _promote_check(check_state, check.key, status, check.message)
    for output in consistency_outputs:
        for check in output.checks:
            _promote_check(check_state, check.key, check.status, check.message)

    blocking_gaps = any(
        gap.severity.strip().lower() in _BLOCKING_GAP_SEVERITIES
        for gap in request.open_gaps
    )
    if blocking_gaps:
        _promote_check(
            check_state,
            "blocking_gaps",
            "fail",
            "One or more blocking gaps remain open.",
        )
    elif request.open_gaps:
        _promote_check(
            check_state,
            "blocking_gaps",
            "warning",
            "One or more non-blocking gaps remain open.",
        )
    category_checks: dict[str, ChapterValidationCheckKey] = {
        "missing_information": "required_content",
        "template_constraint": "template_constraints",
        "unresolved_gap": "blocking_gaps",
        "evidence": "evidence_citations",
        "internal_conflict": "internal_consistency",
        "logic_error": "internal_consistency",
        "cross_chapter_conflict": "cross_chapter_consistency",
    }
    for finding in findings:
        status: ChapterValidationCheckStatus = (
            "fail" if finding.severity == "blocking" else "warning"
        )
        _promote_check(
            check_state,
            category_checks[finding.category],
            status,
            finding.message,
        )

    return [
        ChapterValidationCheck(
            key=key,
            label=_CHECK_LABELS[key],
            status=check_state[key][0],
            message=check_state[key][1],
        )
        for key in _CHECK_ORDER
    ]


def _promote_check(
    check_state: dict[
        ChapterValidationCheckKey,
        tuple[ChapterValidationCheckStatus, str | None],
    ],
    key: ChapterValidationCheckKey,
    status: ChapterValidationCheckStatus,
    message: str | None,
) -> None:
    """Keep the most severe status and its first concise explanation."""
    current_status, current_message = check_state[key]
    if _STATUS_RANK[status] > _STATUS_RANK[current_status] or (
        status == current_status and current_message is None and message is not None
    ):
        check_state[key] = (status, message)


def _aggregate_status(
    checks: list[ChapterValidationCheck],
    findings: list[ChapterValidationFinding],
) -> Literal["ready", "needs_review", "incomplete"]:
    """Map blocking failures, warnings, and clean results to the lifecycle state."""
    if any(check.status == "fail" for check in checks) or any(
        finding.severity == "blocking" for finding in findings
    ):
        return "incomplete"
    if any(check.status == "warning" for check in checks) or findings:
        return "needs_review"
    return "ready"


def _empty_chapter_decision(
    request: ChapterValidationRequest,
) -> ChapterValidationDecision:
    """Return a deterministic incomplete result without spending model tokens."""
    target = next(
        chapter
        for chapter in request.chapters
        if chapter.chapter_id == request.target_chapter_id
    )
    empty_finding = ChapterValidationFinding(
        phase="completeness",
        category="missing_information",
        severity="blocking",
        message="The chapter has no content to validate.",
        suggested_action="Draft the chapter before marking it ready.",
        involved_chapter_ids=[request.target_chapter_id],
    )
    findings = [empty_finding, *_deterministic_gap_findings(request)]

    blocking_gaps = any(
        gap.severity.strip().lower() in _BLOCKING_GAP_SEVERITIES
        for gap in request.open_gaps
    )
    gap_status: ChapterValidationCheckStatus = (
        "fail" if blocking_gaps else "warning" if request.open_gaps else "pass"
    )
    check_state: dict[
        ChapterValidationCheckKey,
        tuple[ChapterValidationCheckStatus, str | None],
    ] = {key: ("pass", None) for key in _CHECK_ORDER}
    check_state["required_content"] = ("fail", empty_finding.message)
    if request.open_gaps:
        check_state["blocking_gaps"] = (
            gap_status,
            "One or more open gaps remain unresolved.",
        )
    checks = [
        ChapterValidationCheck(
            key=key,
            label=_CHECK_LABELS[key],
            status=check_state[key][0],
            message=check_state[key][1],
        )
        for key in _CHECK_ORDER
    ]
    return ChapterValidationDecision(
        target_chapter_id=request.target_chapter_id,
        validated_revision_number=target.revision_number,
        validation_input_fingerprint=request.validation_input_fingerprint,
        status="incomplete",
        checks=checks,
        findings=_deduplicate_findings(findings),
    )
