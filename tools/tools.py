from typing import Optional, Tuple, Union
from langchain.tools import tool
from utils.load_vectorstore import load_vectorstore
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langchain.schema import Document


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
    - search_query (str) - The search query to seach for relevant documents. Provide a full sentence including relevant context instead of just providing key words.
        * For querying the national climate strategy, always use this query: "Brazil's national climate strategy"
        * For querying strategies related to the the climate action adapt the query to search specifically for that climate action.

    **Output**: A list of tuples in the form `[(document, relevance_score)]`.
    - Relevance scores range from `0` (lowest) to `1` (highest).

    **Query Strategies**:
    - Start with broad queries and progressively narrow down the search query.
    """

    vector_store = load_vectorstore(collection_name="all_docs_db")

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

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.50,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


@tool
def retriever_sub_action_tool(
    search_query: str,
) -> Union[list[Tuple[Document, float]], str]:
    """
    This tool is specifically designed to help agents find and retrieve detailed, step-by-step implementation information for certain climate actions from a Chroma vector store.

    **Input**:
    - search_query (str): A detailed, full, and context-rich query
        * Example: "What are the specific steps to implement [climate action] to reduce carbon emissions in the [sector]?"
        * Example: "Describe the implementation process for [climate action] in [city]"

    **Output**:
    - A list of tuples: [(document_text, relevance_score)]
        * Each tuple contains a relevant document excerpt and its relevance score
        * Relevance scores range from 0 (least relevant) to 1 (most relevant)

    **Query Strategies**:
    - Start with broad queries and progressively narrow down
    """

    vector_store = load_vectorstore(collection_name="_docs_db")

    if not vector_store:
        return "Could not load vector store. Please ensure your vector DB is created."

    # metadata_filter = {"section": "sub_actions"}
    metadata_filter = {"level": "national"}

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.50,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


search_municipalities_tool = TavilySearchResults(
    max_results=3,
    search_depth="advanced",  # change between 'basic' for testing and 'advanced' for production
    description="""
    Search for municipal institutions and their contact information that might be relevant for the implementation of the specific climate action for the given city.
    
    Input: A search query in the national language.
    """,
)


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
def placeholder_tool():
    """
    A placeholder tool that does not have any functionality.
    Never call this tool!
    """
