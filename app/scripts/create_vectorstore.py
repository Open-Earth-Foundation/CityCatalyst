import argparse
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv
from pathlib import Path


def create_vectorstore(collection_name: str, embedding_model: str):
    """
    Function that creates a new vector store.
    Vector store is created in the folder /runtime_data/vector_stores/collection_name.

    Input: collection_name (str), embedding_model (str)
    """

    vector_store_path = (
        Path(__file__).parent.parent
        / "runtime_data"
        / "vector_stores"
        / collection_name
    )

    # Create embeddings model
    embeddings = OpenAIEmbeddings(
        model=embedding_model,
    )

    if not vector_store_path.exists():
        print("\nCreating folder structure...\n")
        vector_store_path.mkdir(parents=True, exist_ok=True)

        print("\nCreating Vector Store...\n")

        # Create Chroma vector store
        vector_store = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=str(vector_store_path),
        )

        print(f"\nVector Store created with at {vector_store_path}\n")

    else:
        print(f"\nVector Store already exists at {vector_store_path}\n")


if __name__ == "__main__":
    load_dotenv()

    parser = argparse.ArgumentParser(description="Create a vector store.")
    parser.add_argument(
        "--collection_name",
        type=str,
        required=True,
        help="Name of the collection to store the documents.",
    )
    parser.add_argument(
        "--embedding_model",
        type=str,
        default="text-embedding-3-large",
        help="Name of the embedding model to use for the vector store. Defaults to text-embedding-3-large.",
    )

    args = parser.parse_args()

    create_vectorstore(
        collection_name=args.collection_name, embedding_model=args.embedding_model
    )
