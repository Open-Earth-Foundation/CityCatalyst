import argparse
from pathlib import Path
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def query_vectorstore(
    query: str,
    collection_name: str,
    embedding_model: str,
    k: int = 4,
):
    """
    Loads an existing Chroma vector store and performs a similarity search.
    """

    vector_store_path = (
        Path(__file__).parent.parent
        / "runtime_data"
        / "vector_stores"
        / collection_name
    )

    if not vector_store_path.exists():
        print(f"Vector Store does not exist at {vector_store_path}")
        return

    embeddings = OpenAIEmbeddings(model=embedding_model)

    vector_store = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=str(vector_store_path),
    )

    print(f"Searching for '{query}' in collection '{collection_name}'...")
    results = vector_store.similarity_search(query, k=k)

    print("\n--- Search Results ---")
    if not results:
        print("No results found.")
    else:
        for i, doc in enumerate(results):
            print(f"\n--- Result {i+1} ---")
            print(f"Content: {doc.page_content}")
            print(f"Metadata: {doc.metadata}")
            print("--------------------")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Query a vector store.")
    parser.add_argument(
        "--query",
        type=str,
        required=True,
        help="The query to search for.",
    )
    parser.add_argument(
        "--collection_name",
        type=str,
        default="national_strategy",
        help="Name of the collection in the vector store.",
    )
    parser.add_argument(
        "--embedding_model",
        type=str,
        default="text-embedding-3-large",
        help="Name of the embedding model to use.",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=4,
        help="Number of results to return.",
    )

    args = parser.parse_args()

    query_vectorstore(
        query=args.query,
        collection_name=args.collection_name,
        embedding_model=args.embedding_model,
        k=args.k,
    )
