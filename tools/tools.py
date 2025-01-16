from typing import Optional
from langchain.tools import tool
from utils.load_vectorstore import load_vectorstore
from langchain_community.tools.tavily_search import TavilySearchResults


# Define tools for each agent
# The document_retriever_tool is used to retrieve relevant information about Brazil's national climate strategy.
# If further documents are added, these should be added to a seperate collection and a separate tool should be defined for each collection
# so that the LLM can more accurately retrieve information from the correct collection.
@tool
def document_retriever_tool(search_query: str, metadata_filter: Optional[dict] = None):
    """
        Use this tool to retrieve chunks of text from a collection within a Chroma vector store.

    This Chroma vector store contains a collections with docuemnts related to Brazil's overall climate strategy.
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


@tool
def placeholder_tool():
    """
    A placeholder tool that does not have any functionality.
    Never call this tool!
    """
