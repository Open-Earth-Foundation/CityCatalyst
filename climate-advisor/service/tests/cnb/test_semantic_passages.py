from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.services.document_workspace.semantic_passages import (
    DIMENSIONS,
    PASSAGE_CHARS,
    _source_passages,
    rank_units,
)


@pytest.mark.asyncio
async def test_semantic_rank_recovers_original_position_across_passages_and_batch_order():
    units = [
        SimpleNamespace(text="Routine maintenance."),
        SimpleNamespace(text=" " * 3),
        SimpleNamespace(text="ordinary prose. " * 180 + "magazyn energii"),
    ]
    questions = [
        {"key": "storage", "label": "Energy storage", "description": "Storage capacity"}
    ]

    async def embed(*, input, dimensions, **kwargs):
        assert dimensions == DIMENSIONS
        rows = []
        for index, value in enumerate(input):
            related = "storage" in value.lower() or "magazyn" in value
            rows.append(
                SimpleNamespace(
                    index=index,
                    embedding=([0.0, 1.0] if related else [1.0, 0.0])
                    + [0.0] * (dimensions - 2),
                )
            )
        return SimpleNamespace(data=list(reversed(rows)))

    client = SimpleNamespace(embeddings=SimpleNamespace(create=embed))
    ranked = await rank_units(
        SimpleNamespace(units=units), questions, client, model="embedding"
    )
    assert ranked == {"storage": [2, 0]}
    assert all(len(text) <= PASSAGE_CHARS for _, text in _source_passages(units))


@pytest.mark.asyncio
async def test_invalid_provider_positions_cannot_become_source_locations():
    client = SimpleNamespace(
        embeddings=SimpleNamespace(
            create=AsyncMock(
                return_value=SimpleNamespace(
                    data=[SimpleNamespace(index=2, embedding=[])]
                )
            )
        )
    )
    source = SimpleNamespace(units=[SimpleNamespace(text="Grant application")])
    with pytest.raises(ValueError, match="incomplete source positions"):
        await rank_units(source, [{"key": "form"}], client, model="embedding")
