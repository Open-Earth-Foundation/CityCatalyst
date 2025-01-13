# scripts/add_document_to_vectorstore.py

from pathlib import Path
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from utils.load_vectorstore import load_vectorstore

base_path = Path(__file__).parent.parent
file_folder_base_path = base_path / "data" / "files"

PERSISTENT_DIRECTORY = Path(__file__).parent.parent / "chroma_langchain_db"


def add_document_to_vectorstore(
    file_name: str,
    collection_name: str = "chroma_db",
    embedding_model: str = "text-embedding-3-large",
    chunk_size: int = 2000,
    chunk_overlap: int = 400,
):
    """
    Loads documents from `directory`, splits them, and adds them to the vector store.
    `collection_name` is the name of the Chroma collection.
    """
    full_file_path = file_folder_base_path / file_name

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

        # Choose text splitter. This can be varied depending on document
        # E.g. different chunk sizes, different overlap diffent splitters
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, chunk_overlap=chunk_overlap
        )

        # Load PDF file
        loader = PyPDFLoader(str(full_file_path))

        # Split PDF using text splitter
        pages = loader.load_and_split(text_splitter)

        # Add documents to vector store
        vector_store.add_documents(pages)

    else:
        print(
            f"\nVector Store does not exist at {PERSISTENT_DIRECTORY}\nCreate it first.\n"
        )


if __name__ == "__main__":

    add_document_to_vectorstore(
        file_name="Worldbank_Green_Cities_Brazil.pdf",
        collection_name="chroma_db",
        embedding_model="text-embedding-3-large",
        chunk_size=2000,
        chunk_overlap=200,
    )
