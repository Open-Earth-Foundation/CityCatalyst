import os
import logging
from typing import Tuple, Union, Optional
from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langchain.schema import Document
from langchain_tavily import TavilySearch
from openai import OpenAI

from plan_creator_bundle.utils.get_vectorstore_local import get_vectorstore
from utils.logging_config import setup_logger

setup_logger()
logger = logging.getLogger(__name__)

# Get TAVILY SEARCH MODE from environment variable
TAVILY_SEARCH_MODE = os.getenv("TAVILY_SEARCH_MODE", "basic")


# Define tools for each agent
# The document_retriever_tool is used to retrieve relevant information about Brazil's national climate strategy.
# If further documents are added, these should be added to a seperate collection and a separate tool should be defined for each collection
# so that the LLM can more accurately retrieve information from the correct collection.
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

    print("retriever_main_action_tool")

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

    print("search_query", search_query)
    print("metadata_filter", metadata_filter)

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.40,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


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


@tool
def get_search_municipalities_tool(search_query: str):
    """
    Search for municipal institutions that might be relevant for the implementation of the specific climate action for the given city.
    search_query: A search query in the national language.
    """

    logger.info(f"get_search_municipalities_tool called with query: {search_query}")

    tavily_tool = TavilySearch(
        max_results=2,
        search_depth=TAVILY_SEARCH_MODE,  # change between 'basic' for testing and 'advanced' for production,
    )
    try:
        logger.info("Invoking TavilySearchResults...")
        result = tavily_tool.invoke({"query": search_query})
        logger.debug(f"TavilySearchResults returned: {result}")
        return result
    except Exception as e:
        logger.error(f"Error in TavilySearchResults: {str(e)}", exc_info=True)
        return f"Error during search: {str(e)}"


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
def openai_web_search(
    query: str,
    country: str,
    city: str,
) -> dict:
    """
    Use this tool to search the web for information.

    Args:
        query (str): A search query in the national language.
        country (str): The name of the country the city is located in (two-letter ISO code).
        city (str): The name of the city to search for.
    Returns:
        dict: A dictionary containing only the following fields from the OpenAI web search response:
            - content: The main textual answer from the search.
            - annotations: Any web or source annotations provided by the model.
    """

    # user_location = {"type": "approximate", "approximate": {"country": country}}
    # if region:
    #     user_location["approximate"]["region"] = region
    # if city:
    #     user_location["approximate"]["city"] = city

    # web_search_options = {"user_location": user_location}

    client = OpenAI()
    completion = client.chat.completions.create(
        model="gpt-4o-search-preview",
        # web_search_options=web_search_options,
        web_search_options={
            "user_location": {
                "type": "approximate",
                "approximate": {
                    "country": country,
                    "city": city,
                },
            },
        },
        messages=[
            {
                "role": "user",
                "content": query,
            }
        ],
    )

    print("completion", completion.choices[0])
    result = completion.choices[0].model_dump()
    print("result", result)
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
