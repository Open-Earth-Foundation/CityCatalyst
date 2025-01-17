## Setup vector store:

### Automatically:

Navigate to /scripts folder

Run the bash sript:
`bash populate_strategy_docs.sh`

This will:

- create a vector store with name `strategy_docs_db`
- add `Brazil_NDC_November2024.pdf` to the vector store
- add `Worldbank_Green_Cities_Brazil.pdf` to the vector store

**Info:** If you want to adjust details of how the documents get added (e.g. chunk size, overlap, meta data) you need to add the arguments to the script call in the bash script.

### Manually:

1. python create_vectorstore.py --collection_name strategy_docs_db
2. python add_document_to_vectorstore.py --collection_name strategy_docs_db --file_name Brazil_NDC_November2024.pdf --metadata level=national
3. python add_document_to_vectorstore.py --collection_name strategy_docs_db --file_name Worldbank_Green_Cities_Brazil.pdf level=national
