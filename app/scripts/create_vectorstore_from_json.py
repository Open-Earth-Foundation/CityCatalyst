import json
from pathlib import Path
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain.docstore.document import Document
from dotenv import load_dotenv
import argparse

# Load environment variables
load_dotenv()


def create_vectorstore_from_json(
    input_filepath: Path,
    collection_name: str,
    embedding_model: str,
):
    """
    Creates a Chroma vector store from a flattened JSON file.
    Each JSON object is treated as a document.
    """
    print("Starting vector store creation process...")

    print(f"Loading data from {input_filepath}...")
    with open(input_filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    print("Data loaded successfully.")

    documents = []
    print("Processing documents...")
    for i, item in enumerate(data):
        content = f"Action Name: {item.get('action_name', '')}\nDescription: {item.get('action_description', '')}"

        metadata = {
            "category": item.get("category", ""),
            "action_code": item.get("action_code", ""),
            "target": item.get("target", ""),
            "associated_national_objectives": ", ".join(
                item.get("associated_national_objectives", [])
            ),
        }

        metadata = {k: v for k, v in metadata.items() if v is not None}

        doc = Document(page_content=content, metadata=metadata)
        documents.append(doc)
    print(f"Processed {len(documents)} documents.")

    vector_store_path = (
        Path(__file__).parent.parent
        / "runtime_data"
        / "vector_stores"
        / collection_name
    )
    print(f"Vector store will be saved to: {vector_store_path}")

    print(f"Initializing embedding model: {embedding_model}...")
    embeddings = OpenAIEmbeddings(model=embedding_model)
    print("Embedding model initialized.")

    print("Creating Chroma vector store from documents...")
    vector_store = Chroma.from_documents(
        documents=documents,
        embedding=embeddings,
        collection_name=collection_name,
        persist_directory=str(vector_store_path),
    )
    print("Vector store created and persisted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create a vector store from a JSON file."
    )
    parser.add_argument(
        "--file_name",
        type=str,
        help="Name of the JSON file to use. The file must be in the app/files/json directory.",
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

    args = parser.parse_args()

    base_path = Path(__file__).parent.parent
    input_json_path = base_path / "files" / "json" / args.file_name

    create_vectorstore_from_json(
        input_filepath=input_json_path,
        collection_name=args.collection_name,
        embedding_model=args.embedding_model,
    )
