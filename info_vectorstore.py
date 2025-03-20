# Run this file in debugger mode to easily inspect vector store metadata and documents.

from utils.get_vectorstore_s3 import get_vectorstore

vector_store = get_vectorstore("strategy_docs_db")

info = vector_store.get()
pass
