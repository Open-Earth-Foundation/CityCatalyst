# Run this file in debugger mode to easily inspect vector store metadata and documents.

from utils.load_vectorstore import load_vectorstore

vector_store = load_vectorstore("strategy_docs_db")

info = vector_store.get()
pass
