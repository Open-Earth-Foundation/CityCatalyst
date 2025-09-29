# Climate Advisor Vector Database

This directory contains the vector database functionality for the Climate Advisor service, enabling document storage, text chunking, and semantic search using OpenAI embeddings and pgvector.

## Project Structure

```
vector_db/
├── models/                 # Database models and schemas
│   ├── __init__.py
│   └── document.py         # Document, DocumentChunk, DocumentEmbedding models
├── services/               # Business logic and external API clients
│   ├── __init__.py
│   └── embedding_service.py # OpenAI embedding generation service
├── utils/                  # Utility functions and helpers
│   ├── __init__.py
│   └── text_processing.py  # PDF processing and text splitting utilities
├── migrations/             # Database migration files
│   ├── __init__.py
│   └── 20250126_120000_vector_database.py
├── scripts/               # Additional utility scripts (existing)
├── files/                 # Directory for PDF files to process
├── upload_to_db.py        # Main script for processing PDFs
├── vector_init.py         # Database initialization utilities
└── README.md              # This documentation
```

## Overview

The vector database system provides:

- **PDF Processing**: Extract text content from PDF files
- **Text Chunking**: Split documents into manageable chunks for embedding
- **Embedding Generation**: Create vector embeddings using OpenAI's models
- **Vector Storage**: Store documents and embeddings in PostgreSQL with pgvector
- **Similarity Search**: Enable semantic search across document content

## Quick Start

### 1. Configuration

The vector database uses the centralized `.env` file from the main `climate-advisor/` directory. Ensure your `.env` file contains:

```bash
# Database Configuration
CA_DATABASE_URL="postgresql://climateadvisor:climateadvisor@ca-postgres:5432/climateadvisor"

# OpenAI Configuration for Embeddings
OPENAI_API_KEY="your-openai-api-key-here"
```

Copy `.env.example` to `.env` and fill in your actual values:

```bash
cp ../.env.example ../.env
# Edit .env with your actual database URL and API keys
```

### 2. Database Migration

```bash
cd climate-advisor/service/migrations
python migrate.py upgrade head
```

### 2. Process Your PDFs

```bash
python upload_to_db.py --directory files
```

## Component Details

### Models (`models/`)

**document.py**: SQLAlchemy models for the vector database:

- `Document`: Stores document metadata and full text content
- `DocumentChunk`: Contains text chunks with their metadata
- `DocumentEmbedding`: Stores vector embeddings for each chunk

### Services (`services/`)

**embedding_service.py**: OpenAI embedding generation service:

- Handles API rate limiting and batch processing
- Supports both single text and batch embedding generation
- Includes error handling and retry logic

### Utilities (`utils/`)

**text_processing.py**: Document processing utilities:

- `PDFProcessor`: Extracts text content from PDF files
- `TextSplitter`: Intelligently splits text into chunks
- `DocumentProcessor`: High-level document processing orchestration

### Migrations (`migrations/`)

Database migration files for schema changes:

- Creates pgvector extension and vector tables
- Sets up indexes for optimal performance
- Includes vector similarity search indexes

## Usage Examples

### Basic PDF Processing

```python
from utils.text_processing import DocumentProcessor
from services.embedding_service import EmbeddingService

# Process a PDF file
processor = DocumentProcessor(chunk_size=1000, chunk_overlap=200)
doc_data = processor.process_pdf_file("path/to/document.pdf")

# Generate embeddings
embedding_service = EmbeddingService()
text_chunks = [chunk["content"] for chunk in doc_data["chunks"]]
embedding_results = await embedding_service.generate_embeddings_batch(text_chunks)
```

### Database Operations

```python
from models.document import Document, DocumentChunk, DocumentEmbedding
from sqlalchemy.ext.asyncio import AsyncSession

async def store_document(session: AsyncSession, doc_data, embedding_results):
    # Create document record
    document = Document(**doc_data)
    session.add(document)
    await session.flush()

    # Store chunks and embeddings
    for chunk_data, embedding_result in zip(doc_data["chunks"], embedding_results):
        chunk = DocumentChunk(document_id=document.document_id, **chunk_data)
        session.add(chunk)
        await session.flush()

        embedding = DocumentEmbedding(
            chunk_id=chunk.chunk_id,
            model_name=embedding_result.model,
            embedding_vector=embedding_result.embedding
        )
        session.add(embedding)

    await session.commit()
```

### Vector Search

```python
from services.vector_search import VectorSearchService

search_service = VectorSearchService()
results = await search_service.search_similar("climate change impacts", limit=5)
```

## Configuration

### OpenAI Settings

Configure embedding settings in `../llm_config.yaml`:

```yaml
api:
  openai:
    embedding_model: "text-embedding-3-small" # or "text-embedding-3-large"
    timeout_ms: 30000
```

### Chunking Parameters

The upload script uses fixed chunking parameters defined as constants:

- Chunk size: 1000 characters
- Chunk overlap: 200 characters

To modify these values, edit the `DEFAULT_CHUNK_SIZE` and `DEFAULT_CHUNK_OVERLAP` constants in `upload_to_db.py`.

````

## Development

### Adding New Document Types

1. Extend the `DocumentProcessor` class in `utils/text_processing.py`
2. Add new extraction methods (e.g., `extract_text_from_docx`)
3. Update file type detection logic

### Custom Embedding Models

1. Update the `embedding_model` in configuration
2. Adjust vector dimensions in database schema
3. Update `EmbeddingService.get_model_dimensions()`

### Testing

```bash
# Run the upload script with test data
python upload_to_db.py --directory test_files

# Check database contents
python -c "from models.document import Document; print('Models loaded successfully')"
````

## Performance Considerations

- **Index Optimization**: IVFFlat index parameters can be tuned based on dataset size
- **Batch Processing**: Modify batch sizes based on API rate limits
- **Chunk Strategy**: Experiment with different chunk sizes for your use case
- **Memory Usage**: Large documents may require streaming or batch processing

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure all dependencies are installed and paths are correct
2. **Database Connection**: Verify `CA_DATABASE_URL` environment variable
3. **OpenAI API Limits**: Implement rate limiting and error handling
4. **Memory Issues**: Reduce chunk sizes for large documents

### Debug Mode

```bash
# Enable debug logging
CA_LOG_LEVEL=debug python upload_to_db.py
```

## Security

- Store API keys securely using environment variables
- Validate file uploads to prevent malicious content
- Implement rate limiting for embedding generation
- Consider document access controls for sensitive content

## Future Enhancements

- Support for additional file formats (DOCX, TXT, HTML)
- Integration with other embedding providers (Cohere, Hugging Face)
- Advanced search features (filtering, ranking, hybrid search)
- Document versioning and incremental updates
- Vector database clustering for large-scale deployments
