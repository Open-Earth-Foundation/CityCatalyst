from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv
from pathlib import Path

PERSISTENT_DIRECTORY = Path(__file__).parent.parent / "chroma_langchain_db"


def create_vectorstore(collection_name: str, embedding_model: str):
    """Function that either creates a new vector store or returns an existing one."""

    # Create embeddings model
    embeddings = OpenAIEmbeddings(
        model=embedding_model,
    )

    if not PERSISTENT_DIRECTORY.exists():
        print("\nCreating Vector Store...\n")

        # Create Chroma vector store
        vector_store = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=str(PERSISTENT_DIRECTORY),
        )

        print(f"\nVector Store created with at {PERSISTENT_DIRECTORY}\n")

    else:
        print(f"\nVector Store already exists at {PERSISTENT_DIRECTORY}\n")


if __name__ == "__main__":
    load_dotenv()
    create_vectorstore(
        collection_name="chroma_db", embedding_model="text-embedding-3-large"
    )
