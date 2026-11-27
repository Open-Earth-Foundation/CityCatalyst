from app.services.cnb.source_analysis import SourceSegment
from app.services.document_workspace.targeted_search import (
    SourceSearchPlan,
    targeted_passages,
)


def test_alternative_search_phrase_retains_table_beside_repeated_policy_text():
    paragraphs = [
        SourceSegment(str(n), n, "Ownership register. " + "Land register. " * 30)
        for n in range(1, 11)
    ]
    table = SourceSegment("table", 11, "Title deed | asset | municipal library")
    plan = SourceSearchPlan(
        queries=[
            {
                "key": "premises",
                "terms": ["ownership register", "land register", "title deed"],
            }
        ]
    )
    batches = targeted_passages([paragraphs, [table]], [{"key": "premises"}], plan)
    retained = [segment for _, segments in batches for segment in segments]
    assert table in retained
    assert any(segment in paragraphs for segment in retained)
