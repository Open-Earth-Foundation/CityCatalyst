import logging
from typing import Tuple, Union, Optional, Dict, Any
from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langchain.schema import Document
from openai import OpenAI
from plan_creator_bundle.utils.get_vectorstore_local import get_vectorstore
from plan_creator_bundle.utils.get_json_file import get_json_from_file

logger = logging.getLogger(__name__)


# Define tools for each agent
# The document_retriever_tool is used to retrieve relevant information about a country's national climate strategy.
# If further documents are added, these should be added to a seperate collection and a separate tool should be defined for each collection
# so that the LLM can more accurately retrieve information from the correct collection.


# The following tool is for the implementation in the legacy plan creator.
# DO NOT make changes to this tool.
@tool
def retriever_main_action_tool(
    search_query: str,
) -> Union[list[Tuple[Document, float]], str]:
    """
    Use this tool to retrieve chunks of text from a collection within a Chroma vector store.
    The vector store contains a collections with documents related to Brazil's overall climate strategy.

    **Input**:
    - search_query (str) - A concise search query.
        * Example: "What is Brazil's national climate strategy?"
        * Example: "What are [climate action] implementation strategies?"

    **Output**: A list of tuples in the form `[(document, relevance_score)]`.
    - Relevance scores range from `0` (lowest) to `1` (highest).

    **Query Strategies**:
    - Start with broad queries and progressively narrow down the search query.
    """

    logger.info("retriever_main_action_tool")

    vector_store = get_vectorstore(collection_name="all_docs_db_small_chunks")

    if not vector_store:
        return "Could not load vector store. Please ensure your vector DB is created."

    # Meta data filering using chroma
    #
    # metadata_filter = {"key": {"$eq": value}}
    # or
    # metadata_filter = {
    #     "$or": [{"key": {"$eq": value}}, {"key": {"$eq": value}}]
    # }
    # Chroma filter operators:
    # $eq: Equal to
    # $gt: Greater than
    # $gte: Greater than or equal to
    # $lt: Less than
    # $lte: Less than or equal to
    # $ne: Not equal to
    # $in: In a list of values
    # $nin: Not in a list of values

    metadata_filter = {"main_action": {"$eq": True}}

    logger.info("search_query", search_query)
    logger.info("metadata_filter", metadata_filter)

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.40,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


@tool
def retriever_vectorstore_national_strategy_tool(
    search_query: str,
    country_code: str = "BR",
) -> Union[list[Tuple[Document, float]], str]:
    """
    Use this tool to retrieve chunks of text from a collection within a Chroma vector store.
    The vector store contains a collections with documents related to the country's overall climate strategy.

    **Input**:
    - search_query (str) - A concise search query.
        * Example: "What is Brazil's national climate strategy?"
        * Example: "What is the national climate strategy of Mexico?"
        * Example: "What are [climate action] implementation strategies?"
    - country_code (str) - ISO country code (e.g., "BR" for Brazil, "US" for United States)

    **Output**: A list of tuples in the form `[(document, relevance_score)]`.
    - Relevance scores range from `0` (lowest) to `1` (highest).

    **Query Strategies**:
    - Start with broad queries and progressively narrow down the search query.

    **Error Handling**:
    - If the vector store is not found, it means it does not exist. Proceed with the next tool or continue with the task.
    """

    logger.info(f"Using retriever_vectorstore_national_strategy_tool")
    logger.info(f"Search query: {search_query}")
    logger.info(f"Country code: {country_code}")

    # Load vector store based on country code
    vector_store = get_vectorstore(
        collection_name=f"{country_code.lower()}_national_strategy"
    )

    if not vector_store:
        logger.error(
            f"Could not load vector store for country {country_code}. Please ensure your vector DB is created."
        )
        return "Could not load vector store. Please ensure your vector DB is created."

    # Log the name of the collection
    logger.info(f"Loaded vector store collection name: {vector_store._collection.name}")

    # Meta data filering using chroma
    #
    # metadata_filter = {"key": {"$eq": value}}
    # or
    # metadata_filter = {
    #     "$or": [{"key": {"$eq": value}}, {"key": {"$eq": value}}]
    # }
    # Chroma filter operators:
    # $eq: Equal to
    # $gt: Greater than
    # $gte: Greater than or equal to
    # $lt: Less than
    # $lte: Less than or equal to
    # $ne: Not equal to
    # $in: In a list of values
    # $nin: Not in a list of values

    # metadata_filter = {"main_action": {"$eq": True}}

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.40,
        # filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


@tool
def retriever_json_document_national_strategy_tool(
    country_code: str = "BR",
) -> Union[Dict[Any, Any], str]:
    """
    Use this tool to load a JSON document from a predefined directory.
    The documents contain information related to a country's climate strategy.

    **Input**:
    - country_code (str) - ISO country code (e.g., "BR" for Brazil, "US" for United States)

    **Output**:
    - A dictionary containing the content of the JSON file.

    **Error Handling**:
    - If the file is not found or invalid, proceed with the next tool or continue with the task.
    """
    logger.info(f"Using retriever_json_document_national_strategy_tool")
    logger.info(f"Country code: {country_code}")

    json_content = get_json_from_file(country_code.lower() + "_country_strategy")

    if not json_content:
        logger.error(
            f"Could not load JSON file for country code {country_code}. Please ensure the file exists and is valid."
        )
        return f"Could not load JSON file for country code {country_code}. Please ensure the file exists and is valid."

    logger.info(f"Successfully loaded JSON file for country code: {country_code}")
    return json_content


@tool
def retriever_sub_action_tool(
    search_query: str,
) -> Union[list[Tuple[Document, float]], str]:
    """
    Use this tool to retrieve chunks of text from a collection within a Chroma vector store.
    The vector store contains a collection of documents related to specific climate actions, climate strategies and detailed implementation steps.

    **Input**:
    - search_query (str): A concise search query.
        * Example: "What are the specific steps to implement [climate action] to reduce carbon emissions in the [sector]?"
        * Example: "What are the implementation steps for [climate action]."

    **Output**:
    - A list of tuples: [(document_text, relevance_score)]
        * Each tuple contains a relevant document excerpt and its relevance score
        * Relevance scores range from 0 (least relevant) to 1 (most relevant)

    **Query Strategies**:
    - Start with broad queries and progressively narrow down
    """

    print("retriever_sub_action_tool")

    vector_store = get_vectorstore(collection_name="all_docs_db_small_chunks")

    if not vector_store:
        return "Could not load vector store. Please ensure your vector DB is created."

    metadata_filter = {"sub_actions": {"$eq": True}}

    print("search_query", search_query)
    print("metadata_filter", metadata_filter)

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.50,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


@tool
def retriever_indicators_tool(
    search_query: str,
) -> Union[list[Tuple[Document, float]], str]:
    """
    Retrieve document chunks that provide indicators and guidance for tracking, monitoring,
    and evaluating the implementation of a specific climate action.

    The function enhances the input search query by appending key terms such as
    "monitoring", "evaluation", "tracking indicators", and "implementation progress"
    to guide the retrieval process.

    **Input**:
    - search_query (str): A concise query for a specific climate action.
        * Example: "Indicators for renewable energy adoption"
        * Example: "Tracking progress for urban tree planting initiatives"

    **Output**:
    - A list of tuples: [(document_text, relevance_score)]
        * Each tuple contains a relevant document excerpt and its relevance score
        * Relevance scores range from 0 (least relevant) to 1 (most relevant)

    **Query Strategy**:
    - Start with broad queries and progressively narrow down
    """

    print("retriever_indicators_tool")

    vector_store = get_vectorstore(collection_name="all_docs_db_small_chunks")
    if not vector_store:
        return "Could not load vector store. Please ensure your vector DB is created."

    # Augment the search query with additional keywords for tracking and evaluation
    # enhanced_query = f"{search_query} monitoring evaluation tracking indicators implementation progress"

    metadata_filter = {"indicators": {"$eq": True}}

    print("search_query", search_query)
    print("metadata_filter", metadata_filter)

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.30,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


# The reasoning_tool is experimental. It increases the time a lot but could be used to make sure that the retrieved chunks are relevant.
# When using this tool, instruct the agent to use it in its system prompt e.g.:
#     inside <task> c. Check the relevance of the retrieved information against the search query.
#     inside <tools> - a reasoning tool that can be used to reason over the relevance of the retrieved information from the documents.
# @tool
# def reasoning_tool(search_query: str, chunk: str):
#     """
#     Use this tool to reason over the relevance of the retrieved information from the documents.
#     Compare the original query with the retrieved information and provide a reasoning for each retrieved document.
#     If the document is relevant, provide a short reasoning why it is relevant.
#     If the document is not relevant, provide a short reasoning why it is not relevant.
#     If no documents have been retreived from a search query, update the search query to be more broad and try again.
#     Repeat until the retriever returns relevant documents.

#     **Input**:
#     - search_query (str) - A search query in the national language.

#     **Output**:
#     - reasoning (str) - Your reasoning about the relevance of the chunk to the search query.
#     """

#     prompt_str = f"""
#     You are given a user query:
#     "{search_query}"

#     And you are given a chunk of text:
#     "{chunk}"

#     Determine if the chunk is relevant to the user query.
#     Start your output with either "Relevant:" or "Irrelevant:", followed by
#     1-2 sentences explaining your reasoning.
#     """

#     llm = ChatOpenAI(model="gpt-4o", temperature=0, seed=42)
#     response = llm.invoke([HumanMessage(content=prompt_str)])

#     return response.content


@tool
def openai_web_search_tool(
    query: str,
    country: str,
    city: str,
) -> dict:
    """
    Use this tool to search the web for information with relevance to a specific country and city.

    Args:
        query (str): The search query.
        country (str): The name of the country the city is located in (two-letter ISO code) - e.g., 'BR' for Brazil.
        city (str): The name of the city the search is related to.

    Returns:
        dict: A dictionary containing only the following fields from the OpenAI web search response:
            - content: The main textual answer from the search.
            - annotations: Any web or source annotations provided by the model.
    """

    client = OpenAI()
    completion = client.chat.completions.create(
        model="gpt-4o-search-preview",
        web_search_options={
            "user_location": {
                "type": "approximate",
                "approximate": {
                    "country": country,
                    "city": city,
                },
            },
            "search_context_size": "medium",
        },
        messages=[
            {
                "role": "user",
                "content": query,
            }
        ],
    )

    result = completion.choices[0].model_dump()
    # Only return content and annotations
    return {
        "content": result["message"]["content"],
        "annotations": result["message"]["annotations"],
    }


@tool
def inspect_retrieved_results(search_query: str, chunk: str):
    """
    Use this tool to check if all search queries have retrieved documents (chunks).
    Compare the original query with the retrieved information.
    If no documents have been retreived from a search query, update the search query to be more broad and try again.
    Repeat until the retriever returns relevant documents.

    **Input**:
    - search_query (str) - A search query in the national language.
    - retrieved_chunk (str) - A chunk of text retrieved from the document.

    **Output**:
    - result (str) - The result of the inspection of returned chunks.
    """

    print("inspect_retrieved_results")

    prompt_str = f"""
    You are given a user query:
    "{search_query}"

    And you are given a chunk of text:
    "{chunk}"

    If no documents have been retrieved from a search query, return a message to update the search query to be more broad and try again.
    """

    llm = ChatOpenAI(model="gpt-4o", temperature=0, seed=42)
    response = llm.invoke([HumanMessage(content=prompt_str)])

    return response.content


@tool
def placeholder_tool() -> None:
    """
    A placeholder tool that does not have any functionality.
    Never call this tool!
    """

    return None
