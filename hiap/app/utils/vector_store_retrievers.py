import logging
from typing import Tuple, Union, Any, Optional
from langchain.schema import Document
from utils.get_vectorstore_local import get_vectorstore

logger = logging.getLogger(__name__)


def _serialize_vector_results(
    results: list[tuple[Document, float]],
) -> list[dict[str, Any]]:
    """Convert vector-store retrieval results into a JSON-serializable structure.

    Input: results (list[tuple[Document, float]])
    Output: list[dict[str, Any]]

    Only include:
    - "content"
    - "metadata": { "target", "action_code", "relevance_score" }
    """
    # Filter for metadata keys target and action_code
    serialized: list[dict[str, Any]] = []

    for item in results:
        doc, score = item  # Expect (Document, score)
        content = getattr(doc, "page_content", None)
        meta_raw = getattr(doc, "metadata", {}) or {}
        if not isinstance(meta_raw, dict):
            meta_raw = {}
        meta_filtered: dict[str, Any] = {}
        if "target" in meta_raw:
            meta_filtered["target"] = meta_raw["target"]
        if "action_code" in meta_raw:
            meta_filtered["action_code"] = meta_raw["action_code"]
        meta_filtered["relevance_score"] = score
        serialized.append({"content": content, "metadata": meta_filtered})

    return serialized


def retriever_vectorstore_national_strategy_tool(
    action_type: str,
    search_query: str,
    country_code: str = "BR",
) -> Union[list[Tuple[Document, float]], str]:
    """
    Use this tool to retrieve chunks of text from a collection within a Chroma vector store.
    The vector store contains a collections with documents related to the country's national climate strategy and split into mitigation and adaptation.
    Use this tool to find the closest match between the climate action and the national strategies.

    **Input**:
    - search_query (str) - A concise search query.
        * Example: "[Climate Action Name]"
        * Example: "What is the national climate strategy for [Climate Action Name]?"
        * Example: "What is the national climate strategy for [Climate Action Description]?"
    - country_code (str) - ISO country code (e.g., "BR" for Brazil, "US" for United States)
    - action_type ("mitigation" | "adaptation") - The type of action (mitigation or adaptation)

    **Output**: A list of tuples in the form `[(document, relevance_score)] or a string if the vector store is not found`.
    - Relevance scores range from `0` (lowest) to `1` (highest).

    **Query Strategies**:
    - Start with broad queries and progressively narrow down the search query.

    **Error Handling**:
    - If the vector store is not found, it means it does not exist. Continue with the task.
    """

    # Build the collection name
    collection_name = f"{country_code.lower()}_national_strategy_{action_type}"

    # Load vector store based on country code
    vector_store = get_vectorstore(collection_name=collection_name)

    if not vector_store:
        logger.error(
            f"Could not load vector store {collection_name} for country {country_code}. Please ensure your vector DB is created."
        )
        return "Could not load vector store. Please ensure your vector DB is created."

    # Log the name of the collection (debug to avoid noise on repeated calls)
    logger.debug(
        f"Loaded vector store collection name: {vector_store._collection.name}"
    )

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=1,
        score_threshold=0.33,
    )

    return docs_and_scores


def get_national_strategy_for_prompt(
    country_code: str,
    action_type: Optional[str],
    action_name: Optional[str],
    action_description: Optional[str],
    action_id: str,
) -> list[dict[str, Any]]:
    """
    Helper function to retrieve and serialize national strategy context for prompts.

    Retrieve and serialize national strategy context for prompts.

    Returns an empty list if inputs are missing or vector store is unavailable.
    """
    if action_type is None or action_name is None or action_description is None:
        logger.warning(
            f"Action type, name, or description is None for action_id={action_id}"
        )
        logger.warning(
            f"Action type: {action_type}, Action name: {action_name}, Action description: {action_description}"
        )
        return []

    search_query = (
        f"Action name: {action_name}\n Action description: {action_description}"
    )

    retrieved_national_strategy = retriever_vectorstore_national_strategy_tool(
        action_type=action_type,
        search_query=search_query,
        country_code=country_code,
    )

    if isinstance(retrieved_national_strategy, list):
        return _serialize_vector_results(retrieved_national_strategy)

    logger.warning(
        f"Could not retrieve national strategies from vector store for action_id={action_id}"
    )
    return []
