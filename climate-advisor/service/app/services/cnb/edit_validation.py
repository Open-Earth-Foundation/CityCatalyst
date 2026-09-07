"""Deterministic edit authorization, exact anchors, and evidence validation."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterator
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.concept_note_edits import (
    EditChange,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    EditSourceSnapshot,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
    marker_replacement_text,
    removed_information_markers,
)

PROTECTED_EDIT_PATTERN = re.compile(
    r"\[Information needed:[^\]]*\]|^#{1,6} .+$", re.MULTILINE
)


PROJECT_NAME_TARGET_PATTERN = re.compile(
    r"\b(?:project(?:'s)?\s+(?:full\s+)?(?:name|title)|"
    r"(?:name|title)\s+of\s+(?:the\s+)?project)\b",
    re.IGNORECASE,
)


PROJECT_NAME_REMOVAL_PATTERN = re.compile(
    r"\b(?:remove|delete|omit|drop|replace|rewrite|change|"
    r"neutral(?:ize|ise|\s+(?:wording|openings?))|"
    r"get\s+rid\s+(?:of|off)|(?:do\s+not|don't|not)\s+"
    r"(?:have|use|repeat|include))\b",
    re.IGNORECASE,
)


FIRST_CHAPTER_EXCEPTION_PATTERN = re.compile(
    r"\b(?:except|besides|other\s+than)\s+(?:the\s+)?(?:first|chapter\s*1)\b|"
    r"\bonly\s+(?:in|at)\s+(?:the\s+)?(?:first|chapter\s*1)\b|"
    r"\b(?:keep|retain)\b[^.!?\n]{0,120}\b(?:first\s+chapter|chapter\s*1)\b|"
    r"\b(?:first\s+chapter|chapter\s*1)\b[^.!?\n]{0,120}\b(?:keep|retain)s?\b",
    re.IGNORECASE,
)


def is_project_name_first_chapter_request(instructions: list[str]) -> bool:
    """Recognize direct requests to neutralize later openings but keep Chapter 1."""
    return any(
        PROJECT_NAME_TARGET_PATTERN.search(instruction)
        and PROJECT_NAME_REMOVAL_PATTERN.search(instruction)
        and FIRST_CHAPTER_EXCEPTION_PATTERN.search(instruction)
        for instruction in instructions
    )


def validate_edit_plan(
    request: EditProposalRequest,
    chapters: list[WorkspaceChapterSnapshot],
    plan: EditPlanOutput,
    run_context: dict[str, Any] | None = None,
    *,
    prior_proposal: EditProposalResponse | None = None,
    recent_messages: list[dict[str, str]] | None = None,
) -> list[EditChange]:
    """Bind every automatic change to real provenance and related fact coverage."""
    question_form = request.instruction.rstrip().endswith("?") and not re.search(
        r"\b(?:change|replace|rewrite|make|update|edit|remove|shorten|reword)\b",
        request.instruction,
        re.IGNORECASE,
    )
    if question_form or re.match(
        r"\s*(why\b|what\b|how\b|explain\b|(?:can|could) you explain\b)",
        request.instruction,
        re.IGNORECASE,
    ):
        raise EditOperationError(
            "not_edit_request",
            "This question does not authorize a document edit.",
            status_code=422,
        )
    current = {chapter.chapter_id: chapter for chapter in chapters}
    if (
        request.scope.focused_chapter_id is not None
        and request.scope.focused_chapter_id not in current
    ):
        raise EditOperationError(
            "invalid_target",
            "The focused chapter is no longer available.",
            status_code=422,
        )
    authorized_prior_inputs = [
        *recent_user_inputs(recent_messages),
        *prior_user_inputs(prior_proposal),
    ]
    plan = expand_explicit_global_replacements(request, chapters, plan)
    plan = expand_project_name_opening_replacements(
        chapters,
        plan,
        instructions=[request.instruction, *authorized_prior_inputs],
    )
    allowed = set(current)
    affected = {change.chapter_id for change in plan.changes}
    if affected - allowed:
        raise EditOperationError(
            "invalid_target",
            "The planner selected a chapter outside this draft.",
            status_code=422,
        )
    changes = []
    for change in plan.changes:
        chapter = current.get(change.chapter_id)
        if (
            chapter is None
            or chapter.revision_number is None
            or chapter.body_markdown is None
            or chapter.user_locked
        ):
            raise EditOperationError(
                "invalid_target",
                "The selected chapter is unavailable or locked.",
                status_code=422,
            )
        anchored = anchor_change(change, chapter.body_markdown)
        fills_information_gap = is_information_gap_fill(anchored, chapter)
        if removed_information_markers(anchored.before, anchored.after) and not (
            fills_information_gap
        ):
            raise EditOperationError(
                "marker_changed",
                "Replace a missing-information marker only with content that fills its matching open gap.",
                status_code=422,
            )
        factual = (
            anchored.semantic_support in {"user", "source"}
            or anchored.kind == "factual"
            or fills_information_gap
            or fact_tokens(anchored.before) != fact_tokens(anchored.after)
            or commitment_tokens(anchored.before) != commitment_tokens(anchored.after)
            or entity_tokens(anchored.before) != entity_tokens(anchored.after)
        )
        if anchored.semantic_support == "preserved":
            # Synonyms and modal syntax are not evidence of changed meaning.
            factual = fills_information_gap or Counter(
                fact_tokens(anchored.before)
            ) != Counter(fact_tokens(anchored.after))
        snapshots = validate_provenance(
            anchored,
            request.instruction,
            run_context or {},
            factual,
            prior_inputs=authorized_prior_inputs,
            resulting_claim=resulting_claim(chapter.body_markdown, anchored),
        )
        changes.append(
            EditChange(
                **{
                    **anchored.model_dump(),
                    "kind": "factual" if factual else "wording",
                },
                change_id=uuid4(),
                chapter_title=chapter.title,
                base_revision=chapter.revision_number,
                source_snapshots=snapshots,
            )
        )

    # Compare complete chapter structure and missing markers after exact replacement.
    after_bodies = {
        chapter_id: chapter.body_markdown or ""
        for chapter_id, chapter in current.items()
    }
    for chapter_id in affected:
        before = after_bodies[chapter_id]
        after = replace_anchors(
            before, [change for change in changes if change.chapter_id == chapter_id]
        )
        chapter_changes = [
            change for change in changes if change.chapter_id == chapter_id
        ]
        if not valid_information_marker_result(
            current[chapter_id], before, after, chapter_changes
        ):
            raise EditOperationError(
                "marker_changed",
                "Replace a missing-information marker only with content that fills its matching open gap.",
                status_code=422,
            )
        if re.findall(r"^#{1,6} .+$", before, re.MULTILINE) != re.findall(
            r"^#{1,6} .+$", after, re.MULTILINE
        ):
            raise EditOperationError(
                "structure_changed",
                "Edits must preserve template headings.",
                status_code=422,
            )
        after_bodies[chapter_id] = after
    validate_consistency(
        changes,
        {key: value for key, value in after_bodies.items() if key in allowed},
        instructions=[request.instruction, *authorized_prior_inputs],
    )
    ordered = sorted(
        changes, key=lambda change: (current[change.chapter_id].position, change.start)
    )
    return bind_consistency_groups(ordered)


def is_information_gap_fill(
    change: PlannedTextChange, chapter: WorkspaceChapterSnapshot
) -> bool:
    """Allow a marker replacement only when it supplies text for a matching open gap."""
    removed = removed_information_markers(change.before, change.after)
    if not removed or not marker_replacement_text(change.after):
        return False
    if information_needed_markers(change.after):
        return False
    open_gap_keys = {
        information_marker_key(gap.question)
        for gap in chapter.gaps
        if gap.state in {"open", "caveat"}
    }
    return all(information_marker_key(marker) in open_gap_keys for marker in removed)


def valid_information_marker_result(
    chapter: WorkspaceChapterSnapshot,
    before: str,
    after: str,
    changes: list[EditChange],
) -> bool:
    """Preserve marker order while permitting validated gap-filling removals."""
    before_markers = information_needed_markers(before)
    after_markers = information_needed_markers(after)
    next_before = 0
    for marker in after_markers:
        while (
            next_before < len(before_markers) and before_markers[next_before] != marker
        ):
            next_before += 1
        if next_before == len(before_markers):
            return False
        next_before += 1
    removed = removed_information_markers(before, after)
    return all(
        any(
            marker in change.before
            and marker not in change.after
            and is_information_gap_fill(change, chapter)
            for change in changes
        )
        for marker in removed
    )


def expand_explicit_global_replacements(
    request: EditProposalRequest,
    chapters: list[WorkspaceChapterSnapshot],
    plan: EditPlanOutput,
) -> EditPlanOutput:
    """Complete literal all-occurrence requests without trusting model offsets.

    Models are useful for choosing the replacement and its document-wide scope,
    but they are unreliable at enumerating many repeated offsets. Expansion is
    intentionally limited to pairs whose exact before and after text both occur
    in the human instruction.
    """
    if plan.intent != "edit" or not re.search(
        r"\b(?:all|each|every|everywhere|throughout)\b",
        request.instruction,
        re.IGNORECASE,
    ):
        return plan

    explicit_pair = explicit_global_literal_pair(request.instruction)
    literal_pairs: dict[tuple[str, str], PlannedTextChange] = {}
    for change in plan.changes:
        if change.before in request.instruction and change.after in request.instruction:
            literal_pairs.setdefault((change.before, change.after), change)
    if explicit_pair is not None:
        exemplar = next(
            (
                change
                for change in plan.changes
                if (change.before, change.after) == explicit_pair
            ),
            plan.changes[0],
        )
        literal_pairs = {explicit_pair: exemplar}
    if not literal_pairs:
        return plan

    retained = (
        []
        if explicit_pair is not None
        else [
            change
            for change in plan.changes
            if (change.before, change.after) not in literal_pairs
        ]
    )
    expanded = list(retained)
    for (before, after), exemplar in literal_pairs.items():
        for chapter in chapters:
            for found in literal_occurrences(chapter, before):
                expanded.append(
                    exemplar.model_copy(
                        update={
                            "chapter_id": chapter.chapter_id,
                            "start": found,
                            "before": before,
                            "after": after,
                            "user_input_quote": request.instruction,
                        }
                    )
                )

    return with_expanded_changes(plan, expanded)


def explicit_global_literal_pair(instruction: str) -> tuple[str, str] | None:
    """Extract only the narrow, explicit ``change every X to Y`` command form."""
    match = re.fullmatch(
        r"\s*(?:change|replace)\s+(?:all|each|every)\s+"
        r"(?:occurrences?|instances?|cases?)\s+of\s+(?P<before>.+?)\s+"
        r"(?:to|with)\s+(?P<after>.+?)"
        r"(?:\s+(?:in|throughout|across)\s+(?:this|the)\s+"
        r"(?:concept\s+note|document|draft))?[.!]?\s*",
        instruction,
        re.IGNORECASE,
    )
    if match is None:
        return None
    before = match.group("before").strip(" \t\"'“”‘’")
    after = match.group("after").strip(" \t\"'“”‘’")
    if not before or not after or before == after:
        return None
    return before, after


def expand_project_name_opening_replacements(
    chapters: list[WorkspaceChapterSnapshot],
    plan: EditPlanOutput,
    *,
    instructions: list[str],
) -> EditPlanOutput:
    """Fill an omitted later-chapter opening from the model's chosen replacement."""
    if plan.intent != "edit" or not is_project_name_first_chapter_request(instructions):
        return plan

    ordered_chapters = sorted(chapters, key=lambda chapter: chapter.position)
    if len(ordered_chapters) < 2:
        return plan
    later_chapters = ordered_chapters[1:]
    later_ids = {chapter.chapter_id for chapter in later_chapters}
    candidates = [
        change
        for change in plan.changes
        if change.chapter_id in later_ids
        and change.start <= 600
        and len(change.before.strip()) >= 12
    ]
    if not candidates:
        return plan

    exemplar = max(
        candidates,
        key=lambda change: (
            sum(
                (chapter.body_markdown or "")[:600].count(change.before)
                for chapter in later_chapters
            ),
            len(change.before),
        ),
    )
    expanded = list(plan.changes)
    for chapter in later_chapters:
        start = next(literal_occurrences(chapter, exemplar.before, limit=600), None)
        if start is None:
            continue
        end = start + len(exemplar.before)
        if any(
            change.chapter_id == chapter.chapter_id
            and change.start < end
            and change.start + len(change.before) > start
            for change in expanded
        ):
            continue
        expanded.append(
            exemplar.model_copy(
                update={"chapter_id": chapter.chapter_id, "start": start}
            )
        )

    return with_expanded_changes(plan, expanded)


def bind_consistency_groups(changes: list[EditChange]) -> list[EditChange]:
    """Join related factual occurrences even when the model assigns different groups."""
    labels = list(range(len(changes)))
    facts = []
    for change in changes:
        removed = (
            set(
                Counter(fact_tokens(change.before)) - Counter(fact_tokens(change.after))
            )
            if change.kind == "factual"
            else set()
        )
        # Currency-less formatting may describe the same amount; err toward one group.
        facts.append({token[1] for token in removed})
    for index, change in enumerate(changes):
        for earlier in range(index):
            if change.group_id == changes[earlier].group_id or facts[
                index
            ].intersection(facts[earlier]):
                old, new = labels[index], labels[earlier]
                labels = [new if label == old else label for label in labels]
    return [
        change.model_copy(update={"group_id": changes[labels[index]].group_id})
        for index, change in enumerate(changes)
    ]


def anchor_change(change: PlannedTextChange, body: str) -> PlannedTextChange:
    """Recover a model offset only from one unique exact quote in its chapter."""
    start = change.start
    if body[start : start + len(change.before)] != change.before:
        if body.count(change.before) != 1:
            raise EditOperationError(
                "invalid_anchor",
                "A proposed passage does not have a unique exact draft anchor.",
                status_code=422,
            )
        start = body.index(change.before)
    return change.model_copy(update={"start": start})


FACT_PATTERN = re.compile(
    r"(?P<prefix>EUR|USD|GBP|€|\$|£)?\s*(?P<number>\d(?:[\d.,]*\d)?)(?:\s*(?P<scale>million|billion|thousand|bn|m)\b)?(?:\s*(?P<suffix>EUR|USD|GBP|%))?",
    re.IGNORECASE,
)


def fact_tokens(value: str) -> list[tuple[str, str]]:
    """Canonicalize monetary values, percentages and numbers across common formats."""
    result = []
    for match in FACT_PATTERN.finditer(value):
        raw = match["number"]
        if "," in raw and "." in raw:
            decimal_mark = "," if raw.rfind(",") > raw.rfind(".") else "."
            raw = raw.replace("." if decimal_mark == "," else ",", "").replace(
                decimal_mark, "."
            )
        elif "," in raw:
            raw = raw.replace(
                ",", "" if all(len(part) == 3 for part in raw.split(",")[1:]) else "."
            )
        elif raw.count(".") > 1:
            raw = raw.replace(".", "")
        scale = {
            "million": 1_000_000,
            "m": 1_000_000,
            "billion": 1_000_000_000,
            "bn": 1_000_000_000,
            "thousand": 1_000,
        }.get((match["scale"] or "").lower(), 1)
        currency = (match["prefix"] or match["suffix"] or "number").upper()
        currency = {"€": "EUR", "$": "USD", "£": "GBP"}.get(currency, currency)
        result.append((currency, str((Decimal(raw) * scale).normalize())))
    return result


def normalize_polarity(value: str) -> str:
    """Expand negative contractions consistently before comparing factual polarity."""
    normalized = value.casefold().replace("’", "'").replace("‘", "'")
    special = {
        "can't": "can not",
        "won't": "will not",
        "shan't": "shall not",
        "ain't": "is not",
        "cannot": "can not",
    }
    return re.sub(
        r"\b(?:can't|won't|shan't|ain't|cannot|[a-z]+n't)\b",
        lambda match: special.get(match.group(), match.group()[:-3] + " not"),
        normalized,
    )


def commitment_tokens(value: str) -> list[str]:
    """Prevent changed negation or commitment from being labelled harmless wording."""
    return re.findall(
        r"\b(?:shall|will|would|may|must|can|could|should|not|no|never|guarantee(?:d|s)?)\b",
        normalize_polarity(value),
    )


def entity_tokens(value: str) -> list[str]:
    """Conservatively detect changed named organizations/places in wording output."""
    if re.fullmatch(r"[A-Z][a-z]{2,}", value.strip()):
        return [value.strip()]
    return re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", value)


def prior_user_inputs(proposal: EditProposalResponse | None) -> list[str]:
    """Carry only verified prior human instructions/quotes, never proposed model text."""
    if proposal is None:
        return []
    return list(
        dict.fromkeys(
            [
                proposal.instruction,
                *[
                    change.user_input_quote
                    for change in proposal.changes
                    if change.user_input_quote
                ],
            ]
        )
    )


def recent_user_inputs(messages: list[dict[str, str]] | None) -> list[str]:
    """Return bounded human chat text; assistant messages never authorize edits."""
    return list(
        dict.fromkeys(
            message["content"]
            for message in (messages or [])[-3:]
            if message.get("role") == "user"
            and isinstance(message.get("content"), str)
            and message["content"].strip()
        )
    )


def resulting_claim(body: str, change: PlannedTextChange) -> str:
    """Include surrounding sentence context when a model edits only a negation/modal."""
    start = (
        max(body.rfind("\n", 0, change.start), body.rfind(". ", 0, change.start)) + 1
    )
    end = change.start + len(change.before)
    boundaries = [
        position for marker in ("\n", ". ") if (position := body.find(marker, end)) >= 0
    ]
    stop = min(boundaries) if boundaries else len(body)
    return body[start : change.start] + change.after + body[end:stop]


def claim_words(value: str) -> str:
    """Normalize harmless syntax while retaining negation and commitment words."""
    return " ".join(
        word
        for word in re.findall(r"\w+", normalize_polarity(value))
        if word not in {"a", "an", "the", "is", "are", "was", "were"}
    )


def explicit_removal_or_replacement(
    change: PlannedTextChange, instructions: list[str]
) -> bool:
    """Require user direction naming the text, value, or clear editorial target."""
    before = claim_words(change.before)
    after = claim_words(change.after)
    removed_facts = set(
        Counter(fact_tokens(change.before)) - Counter(fact_tokens(change.after))
    )
    for instruction in instructions:
        instruction = normalize_polarity(instruction)
        words = claim_words(instruction)
        if re.search(
            r"\b(?:do\s+not|don't|never|must\s+not)\s+(?:remove|delete|omit|drop|replace|change)\b",
            instruction,
            re.IGNORECASE,
        ):
            continue

        # A chapter-opening project name is an explicit editorial target even
        # when the user does not repeat the complete proper name verbatim.
        targets_project_name = PROJECT_NAME_TARGET_PATTERN.search(instruction)
        removes_or_neutralizes = PROJECT_NAME_REMOVAL_PATTERN.search(instruction)
        if change.start <= 600 and targets_project_name and removes_or_neutralizes:
            return True

        names_target = bool(before and f" {before} " in f" {words} ") or bool(
            removed_facts and removed_facts.issubset(fact_tokens(instruction))
        )
        if commitment_tokens(change.before) and len(before.split()) == 1:
            names_target = bool(
                re.search(
                    rf"\b(?:remove|delete|omit|drop|replace|change)\s+(?:(?:the\s+)?(?:word|phrase|negation)\s+)?['\"“‘]?{re.escape(before)}\b",
                    instruction,
                    re.IGNORECASE,
                )
            )
        if names_target and re.search(
            r"\b(?:remove|delete|omit|drop)\b", instruction, re.IGNORECASE
        ):
            return True
        if (
            names_target
            and after
            and after in words
            and re.search(
                r"\b(?:replace|change|update|correct|set)\b", instruction, re.IGNORECASE
            )
        ):
            return True
    return False


def supported_claim(claim: str, evidence: str) -> bool:
    """Require matching affirmative sentence polarity, not a substring of a denial."""
    normalized = claim_words(claim)
    if len(normalized.split()) < 2:
        return False
    for match in re.finditer(r"[^.!?\n]+[.!?]?", evidence):
        sentence = match.group().strip()
        if sentence.endswith("?") or commitment_tokens(sentence) != commitment_tokens(
            claim
        ):
            continue
        if f" {normalized} " in f" {claim_words(sentence)} ":
            return True
    return False


def validate_provenance(
    change: PlannedTextChange,
    instruction: str,
    context: dict[str, Any],
    factual: bool,
    *,
    prior_inputs: list[str] | None = None,
    resulting_claim: str | None = None,
) -> list[EditSourceSnapshot]:
    """Verify source identity and that newly stated values occur in actual support."""
    sources = context.get("selected_sources", [])
    supported_text = []
    snapshots = []
    for reference in change.source_refs:
        source = next(
            (
                source
                for source in sources
                if reference in {source.get("upload_id"), source.get("source_label")}
            ),
            None,
        )
        if source is None:
            raise EditOperationError(
                "invalid_source",
                "The proposal references evidence outside this run.",
                status_code=422,
            )
        try:
            snapshots.append(
                EditSourceSnapshot.model_validate(
                    {
                        key: source[key]
                        for key in ("upload_id", "source_label", "sha256")
                    }
                )
            )
        except (KeyError, ValueError):
            raise EditOperationError(
                "invalid_source",
                "The selected source has no verified immutable identity.",
                status_code=422,
            ) from None
        supported_text.append(str(source.get("summary", "")))
        supported_text.extend(
            str(excerpt.get("text", "")) for excerpt in source.get("key_excerpts", [])
        )
    if change.user_input_quote is not None:
        if not change.user_input_quote.strip() or not any(
            change.user_input_quote in value
            for value in [instruction, *(prior_inputs or [])]
        ):
            raise EditOperationError(
                "invalid_user_input",
                "The proposed factual input was not supplied by the user.",
                status_code=422,
            )
        supported_text.append(change.user_input_quote)
    if not factual:
        return snapshots
    corpus = " ".join(supported_text)
    if not corpus:
        raise EditOperationError(
            "clarification_required",
            "What source or explicit factual value should support this change?",
            status_code=422,
        )
    added_facts = Counter(fact_tokens(change.after)) - Counter(
        fact_tokens(change.before)
    )
    removed_facts = Counter(fact_tokens(change.before)) - Counter(
        fact_tokens(change.after)
    )
    meaning_removed = (
        commitment_tokens(change.before) != commitment_tokens(change.after)
        or not change.after.strip()
        or bool(removed_facts and not added_facts)
    )
    explicitly_directed = explicit_removal_or_replacement(
        change, [instruction, *(prior_inputs or [])]
    )
    semantically_supported = change.semantic_support in {"preserved", "user", "source"}
    if change.semantic_support == "user" and not change.user_input_quote:
        raise EditOperationError(
            "invalid_user_input",
            "The reviewed edit has no user instruction quote.",
            status_code=422,
        )
    if change.semantic_support == "source" and not snapshots:
        raise EditOperationError(
            "invalid_source",
            "The reviewed edit has no selected source.",
            status_code=422,
        )
    if meaning_removed and not semantically_supported:
        affirmative_support = supported_claim(resulting_claim or change.after, corpus)
        if not affirmative_support and not explicitly_directed:
            raise EditOperationError(
                "clarification_required",
                "Provide support for the resulting claim or explicitly identify the fact to remove.",
                status_code=422,
            )
    evidence_facts = fact_tokens(corpus)
    if any(
        not any(
            fact == known or (fact[1] == known[1] and "NUMBER" in {fact[0], known[0]})
            for known in evidence_facts
        )
        for fact in added_facts
    ):
        raise EditOperationError(
            "clarification_required",
            "What evidence supports the new value in this edit?",
            status_code=422,
        )
    if not added_facts and not explicitly_directed and not semantically_supported:
        added_words = set(re.findall(r"\w+", change.after.lower())) - set(
            re.findall(r"\w+", change.before.lower())
        )
        common = {
            "a",
            "an",
            "the",
            "of",
            "to",
            "in",
            "and",
            "is",
            "are",
            "be",
            "was",
            "were",
            "will",
        }
        if (added_words - common) - set(re.findall(r"\w+", corpus.lower())):
            raise EditOperationError(
                "clarification_required",
                "Please provide the factual wording or supporting source for this change.",
                status_code=422,
            )
    return snapshots


def validate_consistency(
    changes: list[EditChange],
    after_bodies: dict[UUID, str],
    *,
    instructions: list[str],
) -> None:
    """Refuse omitted related values or contradictory automatic replacements."""
    editable_bodies = [
        PROTECTED_EDIT_PATTERN.sub("", body) for body in after_bodies.values()
    ]
    first_chapter_name_exception = is_project_name_first_chapter_request(instructions)
    replacements: dict[tuple[str, str], set[tuple[str, str] | None]] = {}
    opening_project_name_tokens: set[tuple[str, str]] = set()
    for change in changes:
        if change.kind != "factual":
            continue
        before, after = fact_tokens(change.before), fact_tokens(change.after)
        removed = list((Counter(before) - Counter(after)).elements())
        added = list((Counter(after) - Counter(before)).elements())
        if first_chapter_name_exception and change.start <= 600:
            opening_project_name_tokens.update(removed)
        for index, old in enumerate(removed):
            replacements.setdefault(old, set()).add(
                added[index] if index < len(added) else None
            )
        if (
            not before
            and change.before.strip()
            and any(change.before in body for body in editable_bodies)
        ):
            raise EditOperationError(
                "clarification_required",
                "The original fact still appears elsewhere. Should those occurrences change too?",
                status_code=422,
            )
    if any(len(values) > 1 for values in replacements.values()):
        raise EditOperationError(
            "inconsistent_fact",
            "The proposal gives inconsistent replacements for the same fact.",
            status_code=422,
        )
    remaining = {token for body in editable_bodies for token in fact_tokens(body)}
    for old in replacements:
        if old in opening_project_name_tokens:
            continue
        equivalent_number = ("NUMBER", old[1])
        if old in remaining or (old[0] != "NUMBER" and equivalent_number in remaining):
            raise EditOperationError(
                "clarification_required",
                "The old value also appears elsewhere in the document. Include those "
                "occurrences or clarify which facts should change.",
                status_code=422,
            )


def literal_occurrences(
    chapter: WorkspaceChapterSnapshot, before: str, *, limit: int | None = None
) -> Iterator[int]:
    """Yield exact non-overlapping anchors, excluding locked text and protected markup."""
    if chapter.user_locked or not chapter.body_markdown or not before:
        return
    body = chapter.body_markdown[:limit]
    protected = [match.span() for match in PROTECTED_EDIT_PATTERN.finditer(body)]
    start = 0
    while (found := body.find(before, start)) >= 0:
        start = found + len(before)
        if not any(found < end and start > begin for begin, end in protected):
            yield found


def with_expanded_changes(
    plan: EditPlanOutput, expanded: list[PlannedTextChange]
) -> EditPlanOutput:
    """Apply one shared document-wide expansion limit."""
    if len(expanded) > 100:
        raise EditOperationError(
            "context_limit",
            "This request affects more than 100 exact passages. Split it into smaller edits.",
            status_code=422,
        )
    return plan.model_copy(update={"changes": expanded})
