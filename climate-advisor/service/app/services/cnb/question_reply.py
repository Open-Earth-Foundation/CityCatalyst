"""Atomically bind explicit card replies to the latest saved CNB question."""

import json
import logging
import string
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.db.concept_note import ConceptNoteRun
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.services.cnb.chat_turn import REPLY_TURN_LEASE
from app.services.message_service import MessageService
from app.tools.concept_note_question import (
    ConceptNoteQuestion,
    saved_question,
    saved_question_choices,
    saved_question_invocation,
)
from app.tools.concept_note_ui_labels import normalize_ui_locale
from app.utils.concept_note_context import extract_concept_note_run_id

logger = logging.getLogger(__name__)
QUESTION_MESSAGE_ID = "concept_note_question_message_id"
REPLY_MARKER = "concept_note_question_reply"
QUESTION_CHOICE_SOURCES = "question_choice_sources"
CARD_SELECTION_HEADER = "CONCEPT_NOTE_CARD_SELECTION_JSON"


def thread_run_id(thread: Thread) -> str | None:
    """Read CNB scope from canonical thread data, including older context bindings."""
    return (
        str(thread.concept_note_run_id)
        if thread.concept_note_run_id
        else extract_concept_note_run_id(thread.context)
    )


async def cnb_message_time(session: AsyncSession, thread_id: UUID) -> datetime:
    """Order a CNB append after a row-lock wait using the database write clock."""
    # Callers hold the thread row lock. Transaction-start now() may predate a prior write.
    if session.get_bind().dialect.name == "postgresql":
        return await session.scalar(
            select(
                func.greatest(
                    func.clock_timestamp(),
                    func.max(Message.created_at) + timedelta(microseconds=1),
                )
            ).where(Message.thread_id == thread_id)
        )
    previous = await session.scalar(
        select(func.max(Message.created_at)).where(Message.thread_id == thread_id)
    )
    now = datetime.now(UTC)
    return (
        max(now, previous.replace(tzinfo=UTC) + timedelta(microseconds=1))
        if previous
        else now
    )


def question_message_id(context: object) -> UUID | None:
    """Read an explicit card binding; legacy ordinary messages omit it."""
    if not isinstance(context, dict) or QUESTION_MESSAGE_ID not in context:
        return None
    try:
        return UUID(context[QUESTION_MESSAGE_ID])
    except (TypeError, ValueError, AttributeError) as exc:
        raise stale_question() from exc


def stale_question() -> HTTPException:
    """Return the safe conflict shared by invalid, consumed and stale cards."""
    return HTTPException(
        409,
        detail={
            "code": "concept_note_question_stale",
            "message": "This question has changed or was already answered. Reload the conversation before replying.",
        },
    )


async def save_question_reply(
    session: AsyncSession,
    *,
    thread: Thread,
    question_id: UUID,
    content: str,
    retry: bool,
) -> tuple[UUID, str]:
    """Check and save one reply under the caller's thread row lock.

    A failed stream may retry the exact saved reply after releasing its claim.
    The claim prevents two simultaneous retries from starting two model turns.
    """
    # Require the canonical current CNB binding before reading the submitted card.
    run_id = thread_run_id(thread)
    try:
        run = (
            await session.scalar(
                select(ConceptNoteRun)
                .where(ConceptNoteRun.run_id == UUID(run_id))
                .with_for_update()
            )
            if run_id
            else None
        )
    except (TypeError, ValueError):
        raise stale_question() from None
    if (
        run is None
        or run.status != "active"
        or run.user_id != thread.user_id
        or run.thread_id != thread.thread_id
    ):
        raise stale_question()
    # Read only this owner's thread; the submitted identifier is never authority.
    question = await session.get(Message, question_id)
    if (
        question is None
        or question.thread_id != thread.thread_id
        or question.user_id != thread.user_id
        or question.role != MessageRole.ASSISTANT
        or not saved_question_choices(question.tools_used)
    ):
        raise stale_question()
    recent = list(
        await session.scalars(
            select(Message)
            .where(Message.thread_id == thread.thread_id)
            .order_by(Message.created_at.desc(), Message.message_id.desc())
            .limit(2)
        )
    )
    # Old rows may share transaction timestamps. Do not guess which card is current.
    if len(recent) == 2 and recent[0].created_at == recent[1].created_at:
        raise stale_question()
    latest = recent[0] if recent else None
    now = (
        await session.scalar(select(func.clock_timestamp()))
        if session.get_bind().dialect.name == "postgresql"
        else datetime.now(UTC)
    )
    marker = None
    if latest and isinstance(latest.tools_used, list):
        marker = next(
            (
                item
                for item in latest.tools_used
                if isinstance(item, dict) and item.get("name") == REPLY_MARKER
            ),
            None,
        )
    if latest and latest.message_id == question_id:
        reply = await MessageService(session).create_user_message(
            thread_id=thread.thread_id,
            user_id=thread.user_id,
            text=content,
            created_at=await cnb_message_time(session, thread.thread_id),
        )
    elif (
        retry
        and latest
        and latest.role == MessageRole.USER
        and latest.text == content
        and marker
        and marker.get("question_message_id") == str(question_id)
    ):
        # A live claim is a competing request, not a failed turn to replay.
        if marker.get("active") and marker.get("expires_at", "") > now.isoformat():
            raise stale_question()
        reply = latest
    else:
        raise stale_question()

    # Record provenance and the request claim on the reply, not mutable credentials.
    claim_id = str(uuid4())
    reply.tools_used = [
        {
            "name": REPLY_MARKER,
            "question_message_id": str(question_id),
            "claim_id": claim_id,
            "active": True,
            # The route's renewed turn lease guards a live reply; this expiry
            # only lets a retry take over from a crashed worker.
            "expires_at": (now + REPLY_TURN_LEASE).isoformat(),
        }
    ]
    await session.flush()
    return reply.message_id, claim_id


async def release_question_reply(
    session_factory: async_sessionmaker[AsyncSession] | None,
    claim: tuple[UUID, str] | None,
) -> None:
    """Release only this request's claim after completion, failure or disconnect."""
    if session_factory is None or claim is None:
        return
    try:
        async with session_factory() as session, session.begin():
            reply = await session.scalar(
                select(Message).where(Message.message_id == claim[0]).with_for_update()
            )
            if reply and isinstance(reply.tools_used, list):
                marker = reply.tools_used[0] if reply.tools_used else None
                if isinstance(marker, dict) and marker.get("claim_id") == claim[1]:
                    reply.tools_used = [{**marker, "active": False}]
    except Exception:
        # Keep a failed release closed until the crashed-request lease expires.
        logger.exception("Failed to release CNB question reply claim")


# Cards the chat planner may need to resolve "option B" or "that one".
RECENT_CARD_LIMIT = 3
RECENT_CARD_SCAN = 24


def normalized(value: str) -> str:
    """Compare user-visible text without whitespace or case differences."""
    return " ".join(value.split()).casefold()


def _same_answer(left: str, right: str) -> bool:
    return normalized(left) == normalized(right)


def chosen_label(card: dict[str, Any], text: str) -> str | None:
    """Return the label of the option the text repeats exactly, if any."""
    for option in card["options"]:
        if _same_answer(option["text"], text):
            return option["label"]
    return None


async def recent_question_cards(
    session_factory: async_sessionmaker[AsyncSession] | None,
    *,
    thread_id: UUID | str,
    user_id: str,
) -> list[dict[str, Any]]:
    """Load saved cards from the recent history window, oldest first, with answers.

    Consumers keep the last RECENT_CARD_LIMIT cards they need.

    Each card has message_id, question, labelled options, on_answer, answer
    (the user's next message or None), answer_message_id, selected_label (when
    that answer repeats an option exactly), document_topic and choice_sources
    (server-supplied option provenance, or an empty list).
    """
    if session_factory is None:
        return []
    async with session_factory() as session:
        rows = list(
            await session.scalars(
                select(Message)
                .where(Message.thread_id == UUID(str(thread_id)))
                .order_by(Message.created_at.desc(), Message.message_id.desc())
                .limit(RECENT_CARD_SCAN)
            )
        )
    rows.reverse()
    cards: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        if row.role != MessageRole.ASSISTANT or str(row.user_id) != str(user_id):
            continue
        invocation = saved_question_invocation(row.tools_used)
        question = saved_question(row.tools_used)
        if invocation is None or question is None:
            continue
        following = rows[index + 1] if index + 1 < len(rows) else None
        answered = (
            following is not None
            and following.role == MessageRole.USER
            and str(following.user_id) == str(row.user_id)
            and not _answers_other_question(following.tools_used, row.message_id)
        )
        answer = following.text if answered else None
        card: dict[str, Any] = {
            "message_id": str(row.message_id),
            "question": question.message,
            "options": [
                {"label": label, "text": text}
                for label, text in zip(string.ascii_uppercase, question.options)
            ],
            "on_answer": question.on_answer,
            "answer": answer,
            "answer_message_id": str(following.message_id) if answered else None,
            "document_topic": question.document_topic,
            "choice_sources": _choice_sources(invocation, question),
        }
        card["selected_label"] = chosen_label(card, answer) if answer else None
        cards.append(card)
    return cards


def _answers_other_question(tools: object, question_id: UUID) -> bool:
    """True when a reply row is bound to a different card than this one."""
    if not isinstance(tools, list):
        return False
    marker = next(
        (
            item
            for item in tools
            if isinstance(item, dict) and item.get("name") == REPLY_MARKER
        ),
        None,
    )
    return marker is not None and marker.get("question_message_id") != str(question_id)


def _choice_sources(
    invocation: dict[str, Any], question: ConceptNoteQuestion
) -> list[dict[str, Any]]:
    """Accept server provenance only when it matches the saved options one-to-one."""
    sources = invocation.get(QUESTION_CHOICE_SOURCES)
    if not isinstance(sources, list) or len(sources) != len(question.options):
        return []
    for source in sources:
        if (
            not isinstance(source, dict)
            or not all(
                isinstance(source.get(key), str) and source[key]
                for key in ("question", "label", "text")
            )
            or source.get("on_answer") not in ("reply", "propose_edit")
            or not (
                source.get("document_topic") is None
                or isinstance(source.get("document_topic"), str)
            )
        ):
            return []
    return sources


def option_source(card: dict[str, Any], option: dict[str, str]) -> dict[str, Any]:
    """Return the provenance of a displayed option, following a linked card to its origin."""
    choice_sources = card.get("choice_sources")
    if choice_sources:
        return dict(choice_sources[string.ascii_uppercase.index(option["label"])])
    return {
        "question": card["question"],
        "document_topic": card.get("document_topic"),
        "label": option["label"],
        "text": option["text"],
        "on_answer": card["on_answer"],
    }


def current_selected_card(
    cards: list[dict[str, Any]],
    content: str,
    *,
    reply_message_id: UUID | None = None,
) -> dict[str, Any] | None:
    """Return the card this turn's exact card reply answers, if the reply matches it."""
    if reply_message_id is not None:
        matching = [
            card for card in cards if card["answer_message_id"] == str(reply_message_id)
        ]
        if not matching:
            raise RuntimeError("Claimed CNB card reply missing from history")
        candidate = matching[-1]
    else:
        if not cards:
            return None
        candidate = cards[-1]
    if (
        candidate["selected_label"] is None
        or candidate["answer"] is None
        or not _same_answer(candidate["answer"], content)
    ):
        return None
    return candidate


def referenced_options(cards: list[dict[str, Any]]) -> list[str]:
    """Option texts the user clicked on recent cards.

    Only a click counts as a pick. A typed "option B" stays ordinary chat: the
    planner reads it against the cards, but its text is not human input.
    """
    chosen = [
        option_source(card, option)["text"]
        for card in cards[-RECENT_CARD_LIMIT:]
        for option in card["options"]
        if option["label"] == card["selected_label"]
    ]
    return list(dict.fromkeys(chosen))


def planner_question_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Project cards for the edit planner without storage identifiers."""
    projected = []
    for card in cards[-RECENT_CARD_LIMIT:]:
        item: dict[str, Any] = {
            "question": card["question"],
            "options": card["options"],
            "choosing_prepares_edit": card["on_answer"] == "propose_edit",
            "user_answer": card["answer"],
            "selected_label": card["selected_label"],
        }
        if card.get("choice_sources") and card["selected_label"] is not None:
            option = next(
                option
                for option in card["options"]
                if option["label"] == card["selected_label"]
            )
            item["selected_source"] = option_source(card, option)
        projected.append(item)
    return projected


@dataclass(frozen=True)
class CardPresentation:
    """A server-authored card that replaces the model's question for one turn."""

    question: ConceptNoteQuestion
    sources: list[dict[str, Any]]


@dataclass(frozen=True)
class _CardCopy:
    confirmation: str
    action: str
    fallback_topic: str


# Server-authored card copy; the model never writes these labels.
_CARD_COPY: dict[str, _CardCopy] = {
    "en": _CardCopy(
        "Would you like me to prepare this change for review?",
        "Update {topic} to reflect “{answer}”",
        "the document",
    ),
    "de": _CardCopy(
        "Soll ich diese Änderung zur Prüfung vorbereiten?",
        "„{answer}“ übernehmen und {topic} entsprechend anpassen",
        "das Dokument",
    ),
    "es": _CardCopy(
        "¿Quieres que prepare este cambio para revisión?",
        "Actualizar {topic} según «{answer}»",
        "el documento",
    ),
    "fr": _CardCopy(
        "Voulez-vous que je prépare cette modification pour révision ?",
        "Mettre à jour {topic} en tenant compte de « {answer} »",
        "le document",
    ),
    "pt": _CardCopy(
        "Quer que eu prepare esta alteração para revisão?",
        "Atualizar {topic} de acordo com «{answer}»",
        "o documento",
    ),
}


def preview(text: str, limit: int) -> str:
    """Return one line of text, shortened with an ellipsis when it exceeds the limit."""
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def followup_card(source: dict[str, Any], ui_locale: object) -> CardPresentation:
    """Offer one confirmation button that prepares the picked document change."""
    copy = _CARD_COPY[normalize_ui_locale(ui_locale)]
    topic = source["document_topic"] or copy.fallback_topic
    action = copy.action.format(topic=topic, answer=preview(source["text"], 240))
    question = ConceptNoteQuestion(
        message=copy.confirmation, options=[action], on_answer="propose_edit"
    )
    return CardPresentation(question=question, sources=[dict(source)])


def card_selection_message(
    source: dict[str, Any], presentation: CardPresentation | None
) -> dict[str, str]:
    """Tell the chat model which card choice this turn accepted; not a user reply."""
    payload = {
        "selection": source,
        "followup_option": presentation.question.options[0] if presentation else None,
    }
    return {
        "role": "user",
        "content": CARD_SELECTION_HEADER
        + "\n"
        + json.dumps(payload, ensure_ascii=False),
    }
