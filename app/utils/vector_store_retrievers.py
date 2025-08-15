import logging
from typing import Tuple, Union, Any
from langchain.schema import Document
from utils.get_vectorstore_local import get_vectorstore

logger = logging.getLogger(__name__)


def _serialize_vector_results(results: Any) -> Any:
    """Convert vector-store retrieval results into a JSON-serializable structure.

    Only include:
    - "content"
    - "metadata": { "target", "action_code", "relevance_score" }
    """
    if isinstance(results, list):
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
    if isinstance(results, str):
        return {"message": results}
    if isinstance(results, dict):
        return results
    return {}


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
        * Example: "What is the national climate strategy for [Cliamte Action Name]?"
        * Example: "What is the national climate strategy for [Climate Action Description]?"
    - country_code (str) - ISO country code (e.g., "BR" for Brazil, "US" for United States)
    - action_type ("mitigation" | "adaptation") - The type of action (mitigation or adaptation)

    **Output**: A list of tuples in the form `[(document, relevance_score)]`.
    - Relevance scores range from `0` (lowest) to `1` (highest).

    **Query Strategies**:
    - Start with broad queries and progressively narrow down the search query.

    **Error Handling**:
    - If the vector store is not found, it means it does not exist. Continue with the task.
    """

    # Ensure the LLM only uses the correct action type
    if action_type not in ["mitigation", "adaptation"]:
        logger.error(f"Invalid action type: {action_type}")
        return (
            f"Invalid action type: {action_type}. Check the action type and try again."
        )

    # Build the collection name
    collection_name = f"{country_code.lower()}_national_strategy_{action_type}"

    # Load vector store based on country code
    vector_store = get_vectorstore(collection_name=collection_name)

    if not vector_store:
        logger.error(
            f"Could not load vector store {collection_name} for country {country_code}. Please ensure your vector DB is created."
        )
        return "Could not load vector store. Please ensure your vector DB is created."

    # Log the name of the collection
    logger.info(f"Loaded vector store collection name: {vector_store._collection.name}")

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.33,
    )

    return docs_and_scores
