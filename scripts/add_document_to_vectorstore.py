# scripts/add_document_to_vectorstore.py
import argparse
from pathlib import Path
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

base_path = Path(__file__).parent.parent
file_folder_base_path = base_path / "data" / "files"

# PERSISTENT_DIRECTORY = Path(__file__).parent.parent / "chroma_langchain_db"


def add_document_to_vectorstore(
    file_name: str,
    collection_name: str,
    embedding_model: str,
    chunk_size: int,
    chunk_overlap: int,
):
    """
    Loads documents from `directory`, splits them, and adds them to the vector store.
    `collection_name` is the name of the Chroma collection.

    Adds documents to the vector store in the folder /vector_stores/collection_name.

    Input:
    file_name (str),
    collection_name (str),
    embedding_model (str), -> default="text-embedding-3-large"
    chunk_size (int), -> default=2000
    chunk_overlap (int) -> default=400
    """
    full_file_path = file_folder_base_path / file_name

    vector_store_path = Path(__file__).parent.parent / "vector_stores" / collection_name

    if vector_store_path.exists():
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
            f"\nVector Store does not exist at {vector_store_path}\nCreate it first.\n"
        )


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Add a document to the vector store.")

    parser.add_argument(
        "--file_name",
        type=str,
        required=True,
        help="Name of the PDF file to add to the vector store. The file must be located in the data/files directory.",
    )
    parser.add_argument(
        "--collection_name",
        type=str,
        required=True,
        help="Name of the collection in the vector store.",
    )
    parser.add_argument(
        "--embedding_model",
        type=str,
        default="text-embedding-3-large",
        help="Name of the embedding model to use. Defaults to text-embedding-3-large.",
    )
    parser.add_argument(
        "--chunk_size",
        type=int,
        default=2000,
        help="Size of the chunks to split the document into. Defaults to 2000.",
    )
    parser.add_argument(
        "--chunk_overlap",
        type=int,
        default=400,
        help="Size of the overlap between chunks. Defaults to 400.",
    )

    args = parser.parse_args()

    add_document_to_vectorstore(
        file_name=args.file_name,
        collection_name=args.collection_name,
        embedding_model=args.embedding_model,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
    )
