from typing import Optional
from langchain.tools import tool
from utils.load_vectorstore import load_vectorstore
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI


# Define tools for each agent
# The document_retriever_tool is used to retrieve relevant information about Brazil's national climate strategy.
# If further documents are added, these should be added to a seperate collection and a separate tool should be defined for each collection
# so that the LLM can more accurately retrieve information from the correct collection.
@tool
def document_retriever_tool(search_query: str, metadata_filter: Optional[dict] = None):
    """
        Use this tool to retrieve chunks of text from a collection within a Chroma vector store.

    This Chroma vector store contains a collections with documents related to Brazil's overall climate strategy.
    Use this tool to retrieve relevant information.

    **Input**:
    - search_query (str) - The search query to seach for relevant documents. Provide a full sentence including relevant context instead of just providing key words.
        * For querying the national climate strategy, always use this query: "Brazil's national climate strategy"
        * For querying strategies related to the the climate action adapt the query to search specifically for that climate action.
    - metadata_filter (dict) - A dictionary (e.g., {"level": "national"}) specifying metadata filtering conditions. The filtering can be one of:
        1. "national",
        2. "state",
        3. "local"

    **Output**: A list of tuples in the form `[(document, relevance_score)]`.
    - Relevance scores range from `0` (lowest) to `1` (highest).
    """

    vector_store = load_vectorstore(collection_name="strategy_docs_db")

    if not vector_store:
        return "Could not load vector store. Please ensure your vector DB is created."

    docs_and_scores = vector_store.similarity_search_with_relevance_scores(
        query=search_query,
        k=5,
        score_threshold=0.50,
        filter=metadata_filter,  # Dynamically apply metadata filter
    )

    return docs_and_scores


search = TavilySearchResults(
    max_results=3,
    search_depth="advanced",  # change between 'basic' for testing and 'advanced' for production
    description="""
    Search for municipal institutions and partners and their contact information that might be relevant for the implementation of the specific climate action for the given city.
    
    Input: A search query in the national language.
    """,
)


# The reasoning_tool is experimental. It increases the time a lot but could be used to make sure that the retrieved chunks are relevant.
# When using this tool, instruct the agent to use it in its system prompt e.g.:
#     inside <task> c. Check the relevance of the retrieved information against the search query.
#     inside <tools> - a reasoning tool that can be used to reason over the relevance of the retrieved information from the documents.
@tool
def reasoning_tool(search_query: str, chunk: str):
    """
    Use this tool to reason over the relevance of the retrieved information from the documents.
    Compare the original query with the retrieved information and provide a reasoning for each retrieved document.
    If the document is relevant, provide a short reasoning why it is relevant.
    If the document is not relevant, provide a short reasoning why it is not relevant.

    **Input**:
    - search_query (str) - A search query in the national language.

    **Output**:
    - reasoning (str) - Your reasoning about the relevance of the chunk to the search query.
    """

    prompt_str = f"""
    You are given a user query:
    "{search_query}"

    And you are given a chunk of text:
    "{chunk}"

    Determine if the chunk is relevant to the user query. 
    Start your output with either "Relevant:" or "Irrelevant:", followed by 
    1-2 sentences explaining your reasoning.
    """

    llm = ChatOpenAI(temperature=0, seed=42)
    response = llm.invoke([HumanMessage(content=prompt_str)])

    return response.content


@tool
def placeholder_tool():
    """
    A placeholder tool that does not have any functionality.
    Never call this tool!
    """
