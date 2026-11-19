"""Verify the CNB visual data-fidelity contract and its render-tool wiring."""

import json

from agents.tool import ToolContext
from app.services.cnb.visual_data import (
    VisualData,
    check_visual_data,
    visible_text,
)
from app.tools.concept_note_visual_tools import concept_note_render_visual

DOC = {"kind": "document", "source_index": 1, "locator": "p. 4", "label": "Source 1"}
REPORT = {"kind": "document", "source_index": 2, "locator": "p. 9", "label": "Audit"}


def point(label, value, status="reported", **extra):
    """Build a point with every strict-schema field present."""
    base = {
        "label": label,
        "value": value,
        "status": status,
        "source": None,
        "alternatives": None,
        "derived_from": None,
        "method": None,
    }
    return {**base, **extra}


def data(*points, unit="ktCO2e", source=DOC):
    return {
        "series": [
            {
                "name": "Emissions",
                "unit": unit,
                "source": source,
                "points": list(points),
            }
        ]
    }


FULL_HTML = (
    "<svg><text>2020: 12 ktCO₂e</text><text>2021: 12 or 18 ktCO₂e (Source 1 / Audit)</text>"
    "<text>2022: not reported</text><text>Total 2020+2023: 1,212</text>"
    "<text>2023: 1,200</text></svg><p>Source 1, p. 4</p>"
)
FULL = data(
    point("2020", 12),
    point(
        "2021",
        None,
        "conflicting",
        alternatives=[{"value": 12, "source": DOC}, {"value": 18, "source": REPORT}],
    ),
    point("2022", None, "missing"),
    point("2023", 1200),
    point(
        "Total 2020+2023", 1212, "derived", derived_from=["2020", "2023"], method="sum"
    ),
)


def check(payload, html=FULL_HTML):
    return check_visual_data(VisualData.model_validate(payload), html)


def test_complete_metadata_shown_in_html_passes_without_warnings() -> None:
    result = check(FULL)

    assert result["issues"] == []
    assert result["warnings"] == []
    assert result["summary"] == {
        "series": 1,
        "points": 5,
        "missing": 1,
        "conflicting": 1,
        "derived": 1,
        "derived_checked": 1,
    }


def test_missing_must_not_be_zero_and_reported_must_have_value() -> None:
    result = check(data(point("2022", 0, "missing"), point("2023", None)))

    assert [i["code"] for i in result["issues"]] == [
        "missing_has_value",
        "value_missing",
    ]


def test_unit_and_document_locator_are_required() -> None:
    no_page = {**DOC, "locator": None}
    result = check(data(point("2020", 12), unit=" ", source=no_page))

    assert {i["code"] for i in result["issues"]} == {
        "unit_missing",
        "source_locator_missing",
    }


def test_point_without_any_source_is_rejected() -> None:
    result = check(data(point("2020", 12), source=None))

    assert [i["code"] for i in result["issues"]] == ["source_missing"]
    assert result["issues"][0]["path"] == "series[0].points[0]"


def test_conflict_keeps_two_distinct_sourced_values() -> None:
    one = point("2021", 12, "conflicting", alternatives=[{"value": 12, "source": DOC}])
    unlisted = point(
        "2021b",
        15,
        "conflicting",
        alternatives=[{"value": 12, "source": DOC}, {"value": 18, "source": REPORT}],
    )

    codes = [i["code"] for i in check(data(one, unlisted))["issues"]]

    assert codes == ["conflict_alternatives", "conflict_value_unlisted"]


def test_derived_sum_is_recomputed_and_cannot_use_gaps() -> None:
    wrong = point("Total", 30, "derived", derived_from=["2020", "2021"], method="sum")
    gap = point("Total2", 12, "derived", derived_from=["2020", "2022"], method="sum")
    no_inputs = point("Total3", 12, "derived", derived_from=[], method="sum")
    no_value = point("Total4", None, "derived", derived_from=["2020"], method="sum")
    payload = data(
        point("2020", 12),
        point("2021", 13),
        point("2022", None, "missing"),
        wrong,
        gap,
        no_inputs,
        no_value,
    )

    issues = check(payload)["issues"]

    assert [i["code"] for i in issues] == [
        "derived_sum_mismatch",
        "derived_from_unresolved",
        "derived_inputs",
        "derived_inputs",
    ]
    assert "use method other" in issues[0]["message"]


def test_derived_inputs_may_cite_label_with_value() -> None:
    entries = ["2019: 21.4 ktCO2e (p. 2)", "2020 (p. 2)"]
    total = point("Total", 37, "derived", derived_from=entries, method="sum")
    # "20190" must not match the entry "2019: ..." since "0" is not ":".
    payload = data(point("2019", 21.4), point("20190", 99), point("2020", 15.6), total)

    result = check(payload, "<p>21.4 99 15.6 37 ktCO2e</p>")
    assert result["issues"] == []
    assert result["summary"]["derived_checked"] == 1
    # An entry naming no point is a description: accepted, but not checked.
    wrong = {**total, "derived_from": ["2019x", "2020"]}
    result = check(data(point("2019", 21.4), point("2020", 15.6), wrong))
    assert result["issues"] == []
    assert result["summary"]["derived_checked"] == 0


# Payloads below are trimmed from live gpt-6.1-sol calls that the earlier
# same-series-only rule rejected (cc1241-implementation/after/answers).
USER = {"kind": "user", "source_index": None, "locator": "User message", "label": "You"}


def series(name, unit, *points, source=USER):
    return {"name": name, "unit": unit, "source": source, "points": list(points)}


def test_histogram_counts_described_in_words_are_accepted_unchecked() -> None:
    bins = [
        ("[0,5) MWh", 2, "Count of supplied savings in [0,5) MWh: 0, 4 MWh"),
        ("[5,10) MWh", 3, "Count of supplied savings in [5,10) MWh: 5, 5, 9 MWh"),
        ("[10,15) MWh", 2, "Count of supplied savings in [10,15) MWh: 10, 14 MWh"),
    ]
    points = [
        point(label, n, "derived", derived_from=[text], method="sum")
        for label, n, text in bins
    ]
    html = "<p>[0,5) MWh: 2 homes; [5,10) MWh: 3 homes; [10,15) MWh: 2 homes</p>"

    result = check({"series": [series("Homes per bin", "homes", *points)]}, html)

    assert result["issues"] == [] and result["warnings"] == []
    assert result["summary"]["derived"] == 3
    assert result["summary"]["derived_checked"] == 0


def test_cross_series_differences_are_accepted_but_mislabelled_sums_fail() -> None:
    summer = series("Summer", "days", point("North", 2), point("South", 11))
    winter = series("Winter", "days", point("North", 10), point("South", 3))
    described = series(
        "Winter minus summer",
        "days",
        point(
            "North",
            8,
            "derived",
            derived_from=["Winter North: 10 days", "Summer North: 2 days"],
            method="sum",
        ),
        point(
            "South",
            -8,
            "derived",
            derived_from=["Winter / South", "Summer / South"],
            method="other",
        ),
    )
    html = "<p>North 2, 10, +8 days; South 11, 3, −8 days</p>"

    result = check({"series": [summer, winter, described]}, html)

    assert result["issues"] == []
    assert result["summary"]["derived_checked"] == 0
    # The same difference claimed as a sum of two named points is false.
    described["points"][1]["method"] = "sum"
    issues = check({"series": [summer, winter, described]}, html)["issues"]
    assert [(i["path"], i["code"]) for i in issues] == [
        ("series[2].points[1]", "derived_sum_mismatch")
    ]


def test_cross_series_total_is_recomputed_and_units_must_match() -> None:
    heat = series("Heat", "GWh", point("2023", 6), point("2024", 3))
    power = series("Power", "GWh", point("2023", 4), point("2024", 7))
    total = series(
        "Total",
        "GWh",
        point(
            "2023",
            10,
            "derived",
            derived_from=["Heat / 2023", "Power / 2023"],
            method="sum",
        ),
        point(
            "2024",
            11,
            "derived",
            derived_from=["Heat / 2024", "Power / 2024"],
            method="sum",
        ),
    )
    html = "<p>2023: 6 + 4 = 10 GWh; 2024: 3 + 7 = 11 GWh</p>"

    issues = check({"series": [heat, power, total]}, html)["issues"]
    assert [(i["path"], i["code"]) for i in issues] == [
        ("series[2].points[1]", "derived_sum_mismatch")
    ]
    total["points"][1]["value"] = 10
    assert (
        check({"series": [heat, power, total]}, html)["summary"]["derived_checked"] == 2
    )
    # Labels with values in another series are matched like same-series ones.
    total["points"][0]["derived_from"] = ["2023: 6 GWh (Heat)", "Power / 2023"]
    assert (
        check({"series": [heat, power, total]}, html)["summary"]["derived_checked"] == 1
    )
    # A bare label shared by two other series is ambiguous: not checked.
    total["points"][0]["derived_from"] = ["2023"]
    assert (
        check({"series": [heat, power, total]}, html)["summary"]["derived_checked"] == 1
    )
    power["unit"] = "EUR"
    codes = {i["code"] for i in check({"series": [heat, power, total]}, html)["issues"]}
    assert codes == {"derived_unit_mismatch"}


def test_product_with_factor_from_another_series_and_null_method() -> None:
    energy = series("Energy saved", "kWh", point("0 kWh", 0), point("50 kWh", 50))
    factor = series("Emissions factor", "kg CO2e per kWh", point("Factor", 0.4))
    avoided = series(
        "Avoided emissions",
        "kg CO2e",
        # The entry starts with this point's own label; it must not name itself.
        point("50 kWh", 20, "derived", derived_from=["50 kWh × user factor 0.4"]),
        point(
            "100 kWh",
            40,
            "derived",
            derived_from=["Factor", "100 kWh input"],
            method="other",
        ),
        source=None,
    )
    html = "<p>0 kWh, 50 kWh: 20 kg CO2e, 100 kWh: 40 kg CO2e; 0.4 kg CO2e per kWh</p>"

    result = check({"series": [energy, factor, avoided]}, html)

    assert result["issues"] == []
    assert result["summary"]["derived_checked"] == 0


def test_any_calculation_from_a_gap_or_conflict_is_rejected() -> None:
    conflict = point(
        "2021",
        None,
        "conflicting",
        alternatives=[{"value": 12, "source": DOC}, {"value": 18, "source": REPORT}],
    )
    change = point(
        "Change", 3, "derived", derived_from=["2021", "2022"], method="other"
    )

    issues = check(data(conflict, point("2022", 15), change))["issues"]

    assert [i["code"] for i in issues] == ["derived_from_unresolved"]


def test_values_units_and_gaps_absent_from_html_warn() -> None:
    html = "<svg><rect/><script>12 ktCO2e 2022</script></svg>"
    result = check(data(point("2020", 12), point("2022", None, "missing")), html)

    assert result["issues"] == []
    assert [w["code"] for w in result["warnings"]] == [
        "unit_not_shown",
        "value_not_shown",
        "missing_not_shown",
    ]


def test_visible_text_ignores_scripts_and_keeps_entities() -> None:
    html = "<b>5&nbsp;%</b><style>9{}</style><!-- 7 --><svg><title>8</title></svg>"
    assert visible_text(html).split() == ["5", "%"]


def test_rounded_and_grouped_numbers_match_but_lists_stay_separate() -> None:
    html = "<p>1,212 ktCO2e; 12, 18; 0.5</p>"
    payload = data(
        point("a", 1212.4), point("b", 18), point("c", 0.5), point("d", 1218)
    )

    warnings = check(payload, html)["warnings"]

    assert [w["path"] for w in warnings] == ["series[0].points[3]"]


async def invoke(arguments: dict) -> dict:
    raw = json.dumps(arguments)
    context = ToolContext(
        context=None,
        tool_call_id="visual-1",
        tool_name=concept_note_render_visual.name,
        tool_arguments=raw,
    )
    return json.loads(await concept_note_render_visual.on_invoke_tool(context, raw))


async def test_tool_returns_data_check_on_success() -> None:
    result = await invoke({"title": "Emissions", "html": FULL_HTML, "data": FULL})

    assert result["success"] is True
    assert result["data"]["data_check"]["warnings"] == []
    assert result["data"]["data_check"]["summary"]["points"] == 5


async def test_tool_rejects_invalid_data_with_repairable_issues() -> None:
    payload = data(point("2022", 0, "missing"))

    result = await invoke({"title": "Emissions", "html": FULL_HTML, "data": payload})

    assert result["success"] is False
    assert result["error_code"] == "visual_data_invalid"
    assert result["data"]["issues"][0]["path"] == "series[0].points[0]"


async def test_tool_without_data_keeps_previous_result() -> None:
    for arguments in (
        {"title": "T", "html": FULL_HTML},
        {"title": "T", "html": FULL_HTML, "data": None},
    ):
        result = await invoke(arguments)
        assert result["data"] == {"title": "T", "html_chars": len(FULL_HTML)}


def test_tool_schema_is_strict_and_offers_data() -> None:
    schema = concept_note_render_visual.params_json_schema

    assert concept_note_render_visual.strict_json_schema is True
    assert set(schema["required"]) == {"title", "html", "data"}


def test_model_replay_keeps_data_and_drops_html() -> None:
    from app.utils.concept_note_context import omit_visual_html

    invocation = {
        "name": concept_note_render_visual.name,
        "arguments": {"title": "Emissions", "html": FULL_HTML, "data": FULL},
    }

    replay = omit_visual_html(invocation)

    assert replay["arguments"]["data"] == FULL
    assert replay["arguments"]["html"] == f"[{len(FULL_HTML)} chars omitted]"
