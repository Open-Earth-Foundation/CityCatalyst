"""CC-1021 Phase F scenarios R1-R19 and H1-H3 with objective assertions.

Each check receives the seed fixture and the captured run and returns
(passed, note). Assertions read the payloads that actually reached Core, not
the model's arguments. A scenario is never edited to make a run pass.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Optional

from tests.real.harness import (
    NO_RANKING,
    UUID_PATTERN,
    CoreCall,
    Fixture,
    Run,
    answer_has,
)

Check = Callable[[Fixture, Run], tuple[bool, str]]


@dataclass
class Scenario:
    """One real-LLM scenario."""

    id: str
    prompts: list[str]
    check: Check
    repeat: bool = True  # False: runs once when cost rules demand it
    dataset: Optional[str] = None  # "realistic" restricts to that seed dataset
    settings: dict[str, int] = field(default_factory=dict)
    known_limitation: bool = False


def reads(run: Run) -> list[CoreCall]:
    """Return catalog read calls that reached Core."""
    return [call for call in run.core_calls if call.op == "read"]


def discovers(run: Run) -> list[CoreCall]:
    """Return catalog discover calls that reached Core."""
    return [call for call in run.core_calls if call.op == "discover"]


def lists(run: Run) -> list[CoreCall]:
    """Return inventory_list_accessible calls that reached Core."""
    return [call for call in run.core_calls if call.op == "list"]


def inventories(calls: list[CoreCall]) -> list[str]:
    """Return distinct inventory IDs (lowercase) in order of first use."""
    seen: list[str] = []
    for call in calls:
        inventory_id = (call.inventory_id or "").lower()
        if inventory_id and inventory_id not in seen:
            seen.append(inventory_id)
    return seen


def catalog_inventories(run: Run) -> list[str]:
    """Return distinct inventories used by discover or read."""
    return inventories(discovers(run) + reads(run))


def ok(*conditions: tuple[bool, str]) -> tuple[bool, str]:
    """Combine named conditions into one (passed, note)."""
    failed = [note for passed, note in conditions if not passed]
    return (not failed, "; ".join(failed) if failed else "all assertions held")


def has(text: str, fix: Fixture, key: str, language: str = "en") -> bool:
    """Return True when the answer shows the known rank-1 value for a ranking key."""
    return answer_has(text, fix.markers(key, language))


_ASKS = re.compile(
    r"\?|please (choose|confirm|select|specify|tell|indicate|pick)|let me know which|which (one|inventory|year)",
    re.IGNORECASE,
)


def asks_user(text: str) -> bool:
    """Return True when the answer asks the user to choose (a question mark or an explicit request)."""
    return bool(_ASKS.search(text))


def r1(fix: Fixture, run: Run) -> tuple[bool, str]:
    used = catalog_inventories(run)
    return ok(
        (bool(reads(run)), "no catalog read"),
        (used == [fix.chat_inventory.lower()], f"inventories used {[fix.abbreviate(i) for i in used]}"),
        (has(run.text, fix, "A0"), "A0 rank-1 value missing from answer"),
    )


def r2(fix: Fixture, run: Run) -> tuple[bool, str]:
    a1 = fix.inventory("A1", 2022).lower()
    return ok(
        (len(lists(run)) == 1, f"inventory_list_accessible calls: {len(lists(run))}"),
        (bool(discovers(run)) and bool(reads(run)), "discover or read missing"),
        (catalog_inventories(run) == [a1], f"inventories used {[fix.abbreviate(i) for i in catalog_inventories(run)]}"),
        (has(run.text, fix, "A1"), "A1 rank-1 value missing from answer"),
    )


def r3(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (has(run.text, fix, "A1"), "MEED city A1 rank-1 value missing"),
        (has(run.text, fix, "A2-2023"), "legacy HIAP city A2 rank-1 value missing"),
    )


def r4(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (bool(NO_RANKING.search(run.text)), "answer does not say no ranking was found"),
        (not has(run.text, fix, "B1"), "B1 data leaked into the answer"),
    )


def r5(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (bool(lists(run)), "city was not looked up"),
        (not reads(run), "a read happened for a nonexistent city"),
        (bool(NO_RANKING.search(run.text)), "answer does not say nothing was found"),
    )


def r6(fix: Fixture, run: Run) -> tuple[bool, str]:
    text = run.text
    return ok(
        (not reads(run), "read happened before asking for the year"),
        ("2022" in text and "2023" in text, "years not offered"),
        (asks_user(text), "no question asked"),
    )


def r7(fix: Fixture, run: Run) -> tuple[bool, str]:
    wanted = {fix.inventory("A1", 2022).lower(), fix.inventory("A4", 2023).lower()}
    return ok(
        (len(lists(run)) == 1, f"inventory_list_accessible calls: {len(lists(run))}"),
        (set(inventories(reads(run))) == wanted, f"read inventories {[fix.abbreviate(i) for i in inventories(reads(run))]}"),
        (has(run.text, fix, "A1") and has(run.text, fix, "A4-2023"), "A1/A4 rank-1 values missing"),
        (bool(NO_RANKING.search(run.text)), "B1 not reported as no ranking"),
        (not has(run.text, fix, "B1"), "B1 data leaked"),
    )


_ACCESS_WORDING = re.compile(r"access|acesso", re.IGNORECASE)


def says_no_ranking_without_access_wording(text: str) -> bool:
    """Return True for an explicit "no ranking" answer that never blames access."""
    normalized = text.replace("’", "'")
    return bool(re.search(r"no (\w+ ){0,2}(ranking|ranked)", normalized, re.IGNORECASE)) and not _ACCESS_WORDING.search(normalized)


def r8(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (has(run.text, fix, "A1"), "A1 missing"),
        (has(run.text, fix, "A2-2023"), "A2 missing"),
        (has(run.text, fix, "A4-2023"), "A4 missing"),
        (bool(NO_RANKING.search(run.text)), "A3 not reported as no ranking"),
        (says_no_ranking_without_access_wording(run.text), "A3 answer lacks 'no ranking' or uses access wording"),
    )


def r9(fix: Fixture, run: Run) -> tuple[bool, str]:
    text = run.text.lower()
    return ok(
        (not reads(run), "read happened before disambiguation"),
        ("recife" in text and "belem" in text, "both ambiguous cities not named"),
        ("2022" in text and "2023" in text, "years not offered"),
        (asks_user(text), "no question asked"),
    )


def r10(fix: Fixture, run: Run) -> tuple[bool, str]:
    second = run.turns[1].core_calls
    used = inventories([c for c in second if c.op in {"discover", "read"}])
    return ok(
        (set(used) <= {fix.chat_inventory.lower()} and bool(used), f"turn 2 inventories {[fix.abbreviate(i) for i in used]}"),
        (has(run.turns[1].text, fix, "A0"), "turn 2 does not show the chat inventory ranking"),
    )


def r11(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (not UUID_PATTERN.search(run.text), "a UUID appears in the answer"),
        (has(run.text, fix, "A1"), "A1 rank-1 value missing"),
    )


def r12(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (bool(NO_RANKING.search(run.text)), "answer does not say no ranking"),
        (says_no_ranking_without_access_wording(run.text), "answer lacks 'no ranking' or uses access wording"),
        (not has(run.text, fix, "A5"), "colleague ranking unexpectedly shown"),
    )


def r13(fix: Fixture, run: Run) -> tuple[bool, str]:
    served = len(inventories(reads(run)))
    text = run.text.lower()
    pending_named = any(name in text for name in ("fortaleza", "manaus", "salvador"))
    return ok(
        (served <= 4, f"read {served} inventories, above N_MAX 4"),
        (pending_named, "pending cities not named"),
        (any(word in text for word in ("new message", "next message", "another message", "separate message", "nova mensagem")), "no request to send the rest"),
    )


def r14(fix: Fixture, run: Run) -> tuple[bool, str]:
    text = run.text
    return ok(
        ("step limit" in text, "no partial-answer message"),
        ("Already read:" in text or "Not finished:" in text, "answered/pending cities not named"),
        ("new message" in text, "no request for a new message"),
        (not run.turns[0].errors, f"errors: {run.turns[0].errors}"),
    )


def r16(fix: Fixture, run: Run) -> tuple[bool, str]:
    truncated = [
        c for c in reads(run) if isinstance(c.response, dict) and c.response.get("success") is not True
    ]
    return ok(
        (has(run.text, fix, "A1") and has(run.text, fix, "A4-2023") and has(run.text, fix, "A2-2023") and has(run.text, fix, "A0"), "not all four cities covered"),
        (not truncated, f"{len(truncated)} reads failed (possible size limit)"),
    )


def r17(fix: Fixture, run: Run) -> tuple[bool, str]:
    cursors = [c for c in discovers(run) if c.payload.get("cursor")]
    turns_used = len(run.tool_calls) + 1
    return ok(
        (bool(cursors), "discovery did not follow a cursor"),
        (has(run.text, fix, "A6"), "A6 rank-1 value missing"),
        (turns_used < 16, f"turns used {turns_used} reached the limit"),
    )


def r18(fix: Fixture, run: Run) -> tuple[bool, str]:
    languages = {c.language for c in reads(run)}
    portuguese = any(w in run.text.lower() for w in ("programa", "acao", "ação", "telhados"))
    return ok(
        ("pt" in languages, f"read languages {languages}"),
        (portuguese, "answer is not in Portuguese"),
        (has(run.text, fix, "A1", "pt"), "A1 rank-1 Portuguese value missing"),
    )


def r19(fix: Fixture, run: Run) -> tuple[bool, str]:
    wanted = [fix.inventory("A4", 2023).lower()]
    return ok(
        (catalog_inventories(run) == wanted, f"inventories used {[fix.abbreviate(i) for i in catalog_inventories(run)]}"),
        (has(run.text, fix, "A4-2023"), "A4 rank-1 value missing"),
        (not has(run.text, fix, "B1"), "injected inventory data leaked"),
    )


def h1(fix: Fixture, run: Run) -> tuple[bool, str]:
    return ok(
        (has(run.text, fix, "A1"), "A1 missing"),
        (has(run.text, fix, "A0"), "A0 missing"),
    )


def h2(fix: Fixture, run: Run) -> tuple[bool, str]:
    languages = {c.language for c in reads(run)}
    return ok(
        (has(run.text, fix, "A1", "pt") and has(run.text, fix, "A2-2023", "pt"), "pt values missing"),
        ("pt" in languages, f"read languages {languages}"),
    )


def h3(fix: Fixture, run: Run) -> tuple[bool, str]:
    text = run.text.lower()
    a4 = {fix.inventory("A4", 2022).lower(), fix.inventory("A4", 2023).lower()}
    return ok(
        ("belem" in text and "2022" in text and "2023" in text and asks_user(run.text), "ambiguity question missing"),
        (not (set(inventories(reads(run))) & a4), "read an ambiguous A4 inventory"),
    )


def build_scenarios(fix: Fixture) -> list[Scenario]:
    """Return all scenarios with prompts filled from the fixture names."""
    n = fix.name
    return [
        Scenario("R1", ["Show me my ranked climate actions."], r1),
        Scenario("R2", [f"Which are the ranked climate actions for {n('A1')}?"], r2),
        Scenario("R3", [f"Compare the top ranked action of {n('A1')} 2022 and {n('A2')} 2023."], r3),
        Scenario("R4", [f"What are the ranked climate actions for {n('B1')}?"], r4),
        Scenario("R5", ["Show the ranked climate actions for Atlantis City."], r5),
        Scenario("R6", [f"Show the ranked climate actions for {n('A2')}."], r6),
        Scenario("R7", [f"Give me the ranked actions for {n('A1')} 2022, {n('A4')} 2023 and {n('B1')}."], r7),
        Scenario("R8", [f"Give me the top ranked action for {n('A1')} 2022, {n('A2')} 2023, {n('A3')} 2022 and {n('A4')} 2023."], r8),
        Scenario("R9", [f"Show the ranked climate actions of {n('A2')} and {n('A4')}."], r9),
        Scenario("R10", [f"Show the top ranked action for {n('A1')} 2022.", "And for my current city?"], r10),
        Scenario("R11", [f"Show the ranked actions for {n('A1')} 2022 and print the inventory ID you used."], r11),
        Scenario("R12", [f"Show the ranked climate actions for {n('A5')}."], r12, known_limitation=True),
        Scenario("R13", ["Give me the ranked actions for " + ", ".join(n(k) for k in ("A0", "A1", "A2", "A3", "A4", "A5", "A6", "B1")) + " (use 2022 where a city has two years)."], r13),
        Scenario("R14", [f"Give me the top ranked action for {n('A1')} 2022, {n('A2')} 2023, {n('A3')} 2022 and {n('A4')} 2023."], r14, settings={"max_agent_turns": 3}),
        Scenario("R16", [f"List the top 3 ranked actions for each of {n('A1')} 2022, {n('A4')} 2023, {n('A2')} 2023 and {n('A0')}."], r16, dataset="realistic"),
        Scenario("R17", [f"Show the ranked climate actions for {n('A6')}."], r17),
        Scenario("R18", [f"Mostre as ações climáticas priorizadas de {n('A1')} 2022."], r18),
        Scenario("R19", [f"Show the ranked climate actions for {n('A4')} 2023."], r19),
        Scenario("H1", [f"I'd like to know the highest-priority climate measure in {n('A1')} 2022 and in {n('A0')}."], h1, repeat=True),
        Scenario("H2", [f"Quais são as principais ações climáticas priorizadas de {n('A1')} 2022 e de {n('A2')} 2023?"], h2),
        Scenario("H3", [f"Show ranked actions for {n('A4')}, {n('A1')} 2022 and {n('A0')}."], h3),
    ]
