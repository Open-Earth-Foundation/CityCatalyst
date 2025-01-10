import sys
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

PERSISTENT_DIRECTORY = Path(__file__).parent / "chroma_langchain_db"

print("\nLoading vector store\n")

# Create embeddings model
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-large",
)

# Create Chroma vector store
vector_store = Chroma(
    collection_name="chroma_db",
    embedding_function=embeddings,
    persist_directory=str(PERSISTENT_DIRECTORY),
)

print(vector_store.get(ids="6673ca23-05f8-4bf6-84ab-ab014eaf7388"))

if vector_store.get()["documents"]:
    print(
        f"\nVector Store loaded with: {len(vector_store.get()['documents'])} documents\n"
    )
else:
    print(f"\nVector Store is empty. Ending script.\n")
    sys.exit()


result = vector_store.similarity_search(
    "Brazil would welcome developed countries bringing their net zero commitments to either 2040 or 2045",
    k=2,
)

docs_and_scores = vector_store.similarity_search_with_relevance_scores(
    query="Climate",
    k=4,  # number of documents to retrieve
    score_threshold=0.00,  # minimum similarity score
)

# print(result)

print(docs_and_scores)
