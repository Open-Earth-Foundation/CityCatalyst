"""Two-pass, non-truncating validation for one Concept Note chapter."""

from __future__ import annotations

import json
import logging
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
    ChapterValidationDecision,
    ChapterValidationEvidenceLink,
    ChapterValidationFinding,
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


_BLOCKING_GAP_SEVERITIES = {"missing_information", "critical", "blocking"}


class ChapterValidationError(Exception):
    """Stable failure raised without producing a persistence-ready decision."""

    code = "chapter_validation_failed"
    status_code = 502


class ChapterValidationInputTooLargeError(ChapterValidationError):
    """A complete output or document chapter cannot fit without truncation."""

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
    """Run completeness first, then output-versus-document consistency checks."""

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
        target = next(
            chapter
            for chapter in request.chapters
            if chapter.chapter_id == request.target_chapter_id
        )
        if not (target.body_markdown or "").strip():
            return _empty_chapter_decision(request)

        # Attach one-based positions so model output can cite existing evidence
        # without copying or inventing source metadata.
        target_payload = target.model_dump(mode="json")
        evidence_payload = [
            {"position": position, **evidence.model_dump(mode="json")}
            for position, evidence in enumerate(request.evidence_links, start=1)
        ]
        completeness_payload = {
            "document": {
                "template": (
                    request.template.model_dump(mode="json")
                    if request.template
                    else None
                ),
                "evidence_links": evidence_payload,
            },
            "output": target_payload,
            "open_gaps": [gap.model_dump(mode="json") for gap in request.open_gaps],
        }
        prompts = self._settings.llm.prompts
        budget = self._settings.llm.generation.prompt_budget.cnb_validation
        model_name = self._settings.llm.models.cnb_chapter_validator.name
        fallback_encoding = (
            self._settings.llm.generation.prompt_budget.tokenizer_encoding
        )
        _require_prompt_fit(
            prompt=prompts.get_prompt("cnb_chapter_validation_completeness"),
            payload=completeness_payload,
            output_schema=ChapterCompletenessValidationOutput.model_json_schema(),
            model=model_name,
            fallback_encoding=fallback_encoding,
            max_prompt_tokens=budget.max_prompt_tokens,
            description="output completeness input",
        )

        logger.info(
            "Starting Concept Note chapter validation target_chapter_id=%s chapters=%s",
            request.target_chapter_id,
            len(request.chapters),
        )

        (
            completeness,
            consistency_outputs,
            consistency_batch_count,
        ) = await self._run_validation_passes(
            request=request,
            target_payload=target_payload,
            completeness_payload=completeness_payload,
            evidence_payload=evidence_payload,
            consistency_prompt=prompts.get_prompt("cnb_chapter_validation_consistency"),
            model_name=model_name,
            fallback_encoding=fallback_encoding,
            max_prompt_tokens=budget.max_prompt_tokens,
        )

        findings = _merge_findings(
            request=request,
            completeness=completeness,
            consistency_outputs=consistency_outputs,
        )
        status = _aggregate_status(findings)

        logger.info(
            "Completed Concept Note chapter validation target_chapter_id=%s "
            "status=%s findings=%s consistency_batches=%s",
            request.target_chapter_id,
            status,
            len(findings),
            consistency_batch_count,
        )
        return ChapterValidationDecision(
            target_chapter_id=request.target_chapter_id,
            validated_revision_number=target.revision_number,
            validation_input_fingerprint=request.validation_input_fingerprint,
            status=status,
            findings=findings,
        )

    async def _run_validation_passes(
        self,
        *,
        request: ChapterValidationRequest,
        target_payload: dict[str, Any],
        completeness_payload: dict[str, Any],
        evidence_payload: list[dict[str, Any]],
        consistency_prompt: str,
        model_name: str,
        fallback_encoding: str,
        max_prompt_tokens: int,
    ) -> tuple[
        ChapterCompletenessValidationOutput,
        list[ChapterConsistencyValidationOutput],
        int,
    ]:
        """Execute completeness and every required consistency batch."""
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
                evidence_link_count=len(request.evidence_links),
            )
            batches = _build_consistency_batches(
                output=target_payload,
                completeness=completeness.model_dump(mode="json"),
                document_chapters=[
                    chapter.model_dump(mode="json")
                    for chapter in sorted(
                        (
                            chapter
                            for chapter in request.chapters
                            if chapter.chapter_id != request.target_chapter_id
                        ),
                        key=lambda chapter: (chapter.position, str(chapter.chapter_id)),
                    )
                ],
                evidence_links=evidence_payload,
                prompt=consistency_prompt,
                model=model_name,
                fallback_encoding=fallback_encoding,
                max_prompt_tokens=max_prompt_tokens,
            )
            outputs: list[ChapterConsistencyValidationOutput] = []
            for batch in batches:
                output = await _invoke_pass(
                    run_pass,
                    "consistency",
                    {
                        "document": {
                            "chapters": batch,
                            "evidence_links": evidence_payload,
                        },
                        "output": target_payload,
                        "completeness_result": completeness.model_dump(mode="json"),
                    },
                    ChapterConsistencyValidationOutput,
                )
                _validate_consistency_findings(
                    output,
                    target_chapter_id=request.target_chapter_id,
                    document_chapter_ids={
                        UUID(chapter["chapter_id"]) for chapter in batch
                    },
                    evidence_link_count=len(request.evidence_links),
                )
                outputs.append(output)
            return completeness, outputs, len(batches)
        finally:
            if client is not None:
                await client.close()

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
    output: dict[str, Any],
    completeness: dict[str, Any],
    document_chapters: list[dict[str, Any]],
    evidence_links: list[dict[str, Any]],
    prompt: str,
    model: str,
    fallback_encoding: str,
    max_prompt_tokens: int,
) -> list[list[dict[str, Any]]]:
    """Batch complete chapters greedily while never truncating document text."""

    def fits(chapters: list[dict[str, Any]]) -> bool:
        payload = {
            "document": {
                "chapters": chapters,
                "evidence_links": evidence_links,
            },
            "output": output,
            "completeness_result": completeness,
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

    # The generated output and first-pass result must fit without document chapters.
    if not fits([]):
        raise ChapterValidationInputTooLargeError(
            "Output consistency input exceeds the configured prompt budget"
        )
    if not document_chapters:
        return [[]]

    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for chapter in document_chapters:
        candidate = [*current, chapter]
        if fits(candidate):
            current = candidate
            continue
        if not current:
            raise ChapterValidationInputTooLargeError(
                "A complete document chapter exceeds the configured prompt budget"
            )
        batches.append(current)
        current = [chapter]
        if not fits(current):
            raise ChapterValidationInputTooLargeError(
                "A complete document chapter exceeds the configured prompt budget"
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
    evidence_link_count: int,
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
    _validate_evidence_positions(output, evidence_link_count=evidence_link_count)


def _validate_consistency_findings(
    output: ChapterConsistencyValidationOutput,
    *,
    target_chapter_id: UUID,
    document_chapter_ids: set[UUID],
    evidence_link_count: int,
) -> None:
    """Reject hallucinated references and conflicts unrelated to the output."""
    allowed_ids = {target_chapter_id} | document_chapter_ids
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
                    "Cross-chapter finding did not reference a document chapter"
                )
        elif involved_ids != {target_chapter_id}:
            raise ChapterValidationModelOutputError(
                "Internal consistency finding referenced another chapter"
            )
    _validate_evidence_positions(output, evidence_link_count=evidence_link_count)


def _validate_evidence_positions(
    output: ChapterCompletenessValidationOutput | ChapterConsistencyValidationOutput,
    *,
    evidence_link_count: int,
) -> None:
    """Reject duplicate or unavailable evidence references from model output."""
    for finding in output.findings:
        positions = finding.evidence_positions
        if len(positions) != len(set(positions)) or any(
            position > evidence_link_count for position in positions
        ):
            raise ChapterValidationModelOutputError(
                "Validation finding referenced unavailable evidence"
            )


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
            evidence_links=request.evidence_links,
        )
        if not _finding_is_covered_by_open_gaps(public_finding, request.open_gaps):
            merged.append(public_finding)

    for output in consistency_outputs:
        merged.extend(
            _public_finding(
                finding,
                phase="consistency",
                evidence_links=request.evidence_links,
            )
            for finding in output.findings
        )

    return _deduplicate_findings(merged)


def _finding_is_covered_by_open_gaps(
    finding: ChapterValidationFinding,
    gaps: list[ChapterValidationGap],
) -> bool:
    """Use the prompt's required exact gap reason to remove duplicates."""
    if finding.category not in {
        "missing_information",
        "template_constraint",
        "unresolved_gap",
    }:
        return False
    finding_text = _normalized_text(f"{finding.message} {finding.suggested_action}")
    return any(_normalized_text(gap.reason) in finding_text for gap in gaps)


def _normalized_text(value: str) -> str:
    """Normalize punctuation and whitespace for concise finding comparison."""
    return " ".join(
        "".join(character if character.isalnum() else " " for character in value)
        .casefold()
        .split()
    )


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


def _public_finding(
    finding: ChapterValidationFindingDraft,
    *,
    phase: Literal["completeness", "consistency", "evidence"],
    evidence_links: list[ChapterValidationEvidenceLink],
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
        evidence=[
            evidence_links[position - 1] for position in finding.evidence_positions
        ],
    )


def _deduplicate_findings(
    findings: list[ChapterValidationFinding],
) -> list[ChapterValidationFinding]:
    """Keep the first stable occurrence of repeated batched findings."""
    unique: list[ChapterValidationFinding] = []
    seen: set[tuple[object, ...]] = set()
    for finding in findings:
        key = (
            finding.phase,
            finding.category,
            tuple(sorted(finding.involved_chapter_ids)),
            _normalized_text(finding.message),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(finding)
    return unique


def _aggregate_status(
    findings: list[ChapterValidationFinding],
) -> Literal["ready", "needs_review", "incomplete"]:
    if any(finding.severity == "blocking" for finding in findings):
        return "incomplete"
    if findings:
        return "needs_review"
    return "ready"


def _empty_chapter_decision(
    request: ChapterValidationRequest,
) -> ChapterValidationDecision:
    """Return a deterministic missing-information result without model spend."""
    target = next(
        chapter
        for chapter in request.chapters
        if chapter.chapter_id == request.target_chapter_id
    )
    is_required = target.required
    empty_finding = ChapterValidationFinding(
        phase="completeness",
        category="missing_information",
        severity="blocking" if is_required else "warning",
        message="The chapter has no content to validate.",
        suggested_action=(
            "Draft the chapter before marking it ready."
            if is_required
            else "Add content if it is relevant, or leave the optional chapter blank."
        ),
        involved_chapter_ids=[request.target_chapter_id],
    )
    findings = [empty_finding, *_deterministic_gap_findings(request)]
    return ChapterValidationDecision(
        target_chapter_id=request.target_chapter_id,
        validated_revision_number=target.revision_number,
        validation_input_fingerprint=request.validation_input_fingerprint,
        status=_aggregate_status(findings),
        findings=_deduplicate_findings(findings),
    )
