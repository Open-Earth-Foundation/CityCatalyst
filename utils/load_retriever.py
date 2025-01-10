from pathlib import Path
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain.schema import BaseRetriever
from typing import Optional

PERSISTENT_DIRECTORY = Path(__file__).parent.parent / "chroma_langchain_db"


def load_retriever(
    collection_name: str, embedding_model: str
) -> Optional[BaseRetriever]:

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
        # TODO: Check best search type
        retriever = vector_store.as_retriever(search_type="mmr", search_kwargs={"k": 5})

        return retriever
    else:
        print(
            f"\nVector Store does not exist at {PERSISTENT_DIRECTORY}\nCreate it first.\n"
        )
