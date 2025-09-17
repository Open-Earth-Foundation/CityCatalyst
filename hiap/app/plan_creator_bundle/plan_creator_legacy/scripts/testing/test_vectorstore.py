"""
Test vector store retrieval.

Run with:
python -m plan_creator_legacy.scripts.testing.test_vectorstore
"""

from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

BASE_DIR = Path(__file__).parent.parent.parent

PERSISTENT_DIRECTORY = BASE_DIR / "vector_stores" / "all_docs_db_small_chunks"

print("\nLoading vector store\n")

# Create embeddings model
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-large",
)

# Create Chroma vector store
vector_store = Chroma(
    collection_name="all_docs_db_small_chunks",
    embedding_function=embeddings,
    persist_directory=str(PERSISTENT_DIRECTORY),
)

if vector_store.get()["ids"]:
    print("Vector store contains data, proceeding with retrieval.")
else:
    print("Warning: Vector store is empty or the collection name is incorrect.")


enhanced_query = "Monitoramento, avaliação, rastreamento, indicadores"

metadata_filter = {"indicators": {"$eq": True}}

docs_and_scores = vector_store.similarity_search_with_relevance_scores(
    query=enhanced_query,
    k=5,
    score_threshold=0.00,
    filter=metadata_filter,  # Dynamically apply metadata filter
)

print(docs_and_scores)
