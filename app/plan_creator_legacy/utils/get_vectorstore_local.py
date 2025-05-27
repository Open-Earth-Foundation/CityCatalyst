# plan_creator_legacy/utils/get_vectorstore_local.py

"""
This module provides functionality to load a vector store from a local directory.

Args:
    collection_name: Name of the collection to load

Returns:
    vector_store: Chroma vector store
"""

from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).parent.parent.parent
VECTOR_STORE_PATH = BASE_DIR / "vector_stores"

# Global dictionary to store loaded vector stores
VECTOR_STORES = {}


def get_vectorstore(collection_name: str) -> Optional[Chroma]:
    """Load vector store once and reuse it across function calls."""
    if collection_name not in VECTOR_STORES:
        VECTOR_STORES[collection_name] = load_vectorstore(collection_name)
    return VECTOR_STORES[collection_name]


def load_vectorstore(
    collection_name: str, embedding_model: str = "text-embedding-3-large"
) -> Optional[Chroma]:
    """
    Loads an existing vector store from folder /vector_stores and returns it.
    Looks for the vector store in the folder /vector_stores/collection_name.

    Input: collection_name (str), embedding_model (str)
    Returns: vector_store (Chroma)
    """

    vector_store_path = VECTOR_STORE_PATH / collection_name

    if vector_store_path.exists():
        print(f"Loading vector store {collection_name}...")
        # Load existing vector store

        # Create embeddings model
        embeddings = OpenAIEmbeddings(
            model=embedding_model,
        )

        # Load vector store
        vector_store = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=str(vector_store_path),
        )

        print(
            f"Vector Store loaded with: {len(vector_store.get()['documents'])} documents\n"
        )

        return vector_store

    else:
        print(
            f"Could not load vector store {collection_name}. Please ensure your vector DB is created."
        )
