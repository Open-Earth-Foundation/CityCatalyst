"""Find source units relevant to a form even when the form uses another language."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator, Sequence
from itertools import islice

import numpy as np

DIMENSIONS = 768
BATCH_SIZE = 40
PASSAGE_CHARS = 1800
RANKED_UNIT_LIMIT = 40


def _source_passages(units) -> Iterator[tuple[int, str]]:
    """Keep the original unit identity through overlapping, bounded slices."""
    for index, unit in enumerate(units):
        text = unit.text.strip()
        start = 0
        while start < len(text):
            end = min(start + PASSAGE_CHARS, len(text))
            if end < len(text):
                boundary = max(
                    text.rfind("\n", start + 1100, end),
                    text.rfind(". ", start + 1100, end),
                )
                if boundary >= 0:
                    end = boundary + 1
            yield index, text[start:end]
            if end == len(text):
                break
            start = end - 150


def _question(point):
    title = point.get("label") or point["key"]
    section = " ".join(
        entry["title"]
        for entry in point.get("section_context", [])
        if entry.get("title")
    )
    return f"{section}. {title}. {point.get('description', title)}"[:5000]


def _normalized_embeddings(response, size):
    rows = sorted(response.data, key=lambda item: item.index)
    if [row.index for row in rows] != list(range(size)):
        raise ValueError("The embedding provider returned incomplete source positions")
    vectors = np.asarray([row.embedding for row in rows], dtype=np.float32)
    if vectors.shape != (size, DIMENSIONS) or not np.isfinite(vectors).all():
        raise ValueError("The embedding provider returned invalid vectors")
    norm = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norm, 1e-12)


async def rank_units(source, points, client, *, model, concurrency=3):
    """Rank original unit positions by cosine similarity, independently for each field.

    Each long unit receives the score of its best passage. The vectors are local
    to this read and released after each wave of provider requests.
    """
    if not points or not any(unit.text.strip() for unit in source.units):
        return {}

    async def embed(strings: Sequence[str]):
        response = await client.embeddings.create(
            model=model,
            input=list(strings),
            dimensions=DIMENSIONS,
            encoding_format="float",
        )
        return await asyncio.to_thread(_normalized_embeddings, response, len(strings))

    questions = [_question(point) for point in points]
    query_vectors = np.concatenate(
        [
            await embed(questions[start : start + BATCH_SIZE])
            for start in range(0, len(questions), BATCH_SIZE)
        ]
    )
    # Track one score per original unit, keeping memory independent of passage length.
    scores = np.full((len(points), len(source.units)), -np.inf, dtype=np.float32)
    passages = _source_passages(source.units)
    wave_size = BATCH_SIZE * max(1, concurrency)
    while wave := list(islice(passages, wave_size)):
        batches = [wave[i : i + BATCH_SIZE] for i in range(0, len(wave), BATCH_SIZE)]
        results = await asyncio.gather(
            *(embed([text for _, text in batch]) for batch in batches)
        )
        for batch, vectors in zip(batches, results, strict=True):
            similarities = await asyncio.to_thread(np.matmul, query_vectors, vectors.T)
            for column, (position, _) in enumerate(batch):
                np.maximum(
                    scores[:, position],
                    similarities[:, column],
                    out=scores[:, position],
                )
    return {
        point["key"]: [
            int(index)
            for index in np.argsort(-row, kind="stable")[:RANKED_UNIT_LIMIT]
            if np.isfinite(row[index])
        ]
        for point, row in zip(points, scores, strict=True)
    }
