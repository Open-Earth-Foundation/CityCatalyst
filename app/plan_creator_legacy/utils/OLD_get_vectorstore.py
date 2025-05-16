# plan_creator_legacy/utils/OLD_get_vectorstore.py

from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from pathlib import Path
from typing import Optional
import logging

# Configure logging
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent.parent
VECTOR_STORE_PATH = BASE_DIR / "plan_creator_legacy" / "vector_stores"

# Global dictionary to store loaded vector stores
VECTOR_STORES = {}


def get_vectorstore(collection_name: str) -> Optional[Chroma]:
    """Load vector store once and reuse it across function calls."""
    if collection_name not in VECTOR_STORES:
        logger.info(f"Loading vector store for collection: {collection_name}")
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
        logger.info(f"Loading vector store {collection_name}...")
        try:
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

            logger.info(
                f"Vector Store loaded successfully with: {len(vector_store.get()['documents'])} documents"
            )

            return vector_store

        except Exception as e:
            logger.error(
                f"Error loading vector store {collection_name}: {str(e)}", exc_info=True
            )
            return None

    else:
        logger.error(
            f"Vector store not found at path: {vector_store_path}. Please ensure your vector DB is created."
        )
        return None
