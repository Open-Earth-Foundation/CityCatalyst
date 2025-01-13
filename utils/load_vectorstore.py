# utils/load_vectorstore.py

from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from pathlib import Path
from typing import Optional

PERSISTENT_DIRECTORY = Path(__file__).parent.parent / "chroma_langchain_db"


def load_vectorstore(
    collection_name: str = "chroma_db", embedding_model: str = "text-embedding-3-large"
) -> Optional[Chroma]:
    """
    Loads an existing vector store and returns it.
    """

    if PERSISTENT_DIRECTORY.exists():
        # Load existing vector store

        # Create embeddings model
        embeddings = OpenAIEmbeddings(
            model=embedding_model,
        )

        # Load vector store
        vector_store = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=str(PERSISTENT_DIRECTORY),
        )

        return vector_store

    else:
        print("Could not load vector store. Please ensure your vector DB is created.")
