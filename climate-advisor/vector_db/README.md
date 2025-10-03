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
├── scripts/               # Additional utility scripts (existing)
├── files/                 # Directory for PDF files to process
├── embedding_config.yml   # Configuration for embeddings and chunking
├── config_loader.py       # Configuration loader utility
├── upload_to_db.py        # Main script for processing PDFs
├── vector_init.py         # Database initialization utilities
└── README.md              # This documentation

Note: Database migrations are managed in ../service/migrations/
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

### 2. Database Setup

#### Prerequisites

The PostgreSQL container must have the pgvector extension installed. If not already installed:

```bash
# Install pgvector in the PostgreSQL container
docker exec ca-postgres apt update
docker exec ca-postgres apt install -y postgresql-15-pgvector

# Create the extension as superuser
docker exec ca-postgres psql -U postgres -d climateadvisor -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

#### Run Vector Database Migration

```bash
# Navigate to vector_db directory
cd climate-advisor/vector_db

# Run the migration using the service virtual environment
../.venv/Scripts/python.exe -m alembic upgrade head

# Verify migration was successful
../.venv/Scripts/python.exe -m alembic current
# Should show: 20250126_120000 (head)
```

#### Verify Setup

```bash
# Connect to database and verify
docker exec ca-postgres psql -U climateadvisor -d climateadvisor

# Check pgvector extension
\dx vector

# Check document_embeddings table
\d document_embeddings

# Test vector operations
SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector as distance;
```

### 3. Process Your PDFs

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

### Database Migrations

**Database migrations are now centralized** in `climate-advisor/service/migrations/`.

The vector database schema (pgvector extension and `document_embeddings` table) is included in the main service migration file:

- **Migration**: `service/migrations/versions/20250118_120000_initial_schema.py`
- **Includes**:
  - Service tables (`threads`, `messages`)
  - Vector database tables (`document_embeddings` with pgvector)
  - pgvector extension setup

**Running Migrations:**

Migrations are managed through the main service:

```bash
# From climate-advisor/service directory
alembic upgrade head        # Apply all migrations
alembic current             # Show current version
alembic history             # Show migration history
```

Or use the Kubernetes migration job:

```bash
kubectl create -f k8s/ca-migrate.yml
```

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

### Creating Vector Similarity Index

After inserting embeddings, create the IVFFlat index for fast similarity search:

```sql
-- Connect to database
docker exec ca-postgres psql -U climateadvisor -d climateadvisor

-- Create IVFFlat index (only after data is inserted)
CREATE INDEX IF NOT EXISTS ix_document_embeddings_vector
ON document_embeddings
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
```

### Vector Search

```python
from sqlalchemy import text

async def search_similar(session, query_embedding, limit=5):
    """Search for similar documents using vector similarity."""
    query = text("""
        SELECT
            de.embedding_id,
            de.model_name,
            de.embedding_vector <=> :query_vector as distance,
            de.created_at
        FROM document_embeddings de
        ORDER BY de.embedding_vector <=> :query_vector
        LIMIT :limit
    """)

    result = await session.execute(
        query,
        {"query_vector": query_embedding, "limit": limit}
    )
    return result.fetchall()
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

### Embedding and Chunking Configuration

All embedding and chunking parameters are now centralized in `embedding_config.yml`:

```yaml
# Text Processing Configuration
text_processing:
  max_text_length: 8000

# Document Chunking Configuration
chunking:
  default_chunk_size: 1000
  default_chunk_overlap: 200

# File Processing Configuration
file_processing:
  default_directory: "files"

# Embedding Service Configuration
embedding_service:
  batch_size: 100
  requests_per_minute: 3500
```

To modify these values, edit `embedding_config.yml`. The configuration is loaded automatically by the scripts and services.

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

## Migration Setup Issues & Solutions

### Common issues

**Problem 1: Migration File Location**

- **Symptom**: `alembic upgrade head` ran without errors but created nothing
- **Root Cause**: Migration file was in `migrations/` instead of `migrations/versions/`
- **Why**: Alembic requires migrations in a `versions/` subdirectory
- **Solution**: Created `migrations/versions/` and moved `20250126_120000_vector_database.py` there
- **Verification**: `alembic history` now shows the migration

**Problem 2: pgvector Extension Not Installed**

- **Symptom**: `ERROR: extension "vector" is not available`
- **Root Cause**: pgvector extension not installed in PostgreSQL container
- **Why**: Base `postgres:15` image doesn't include pgvector
- **Solution**:
  ```bash
  docker exec ca-postgres apt install -y postgresql-15-pgvector
  docker exec ca-postgres psql -U postgres -d climateadvisor -c "CREATE EXTENSION IF NOT EXISTS vector;"
  ```
- **Note**: Must use `postgres` superuser, not `climateadvisor` user

**Problem 3: Vector Type Column Creation**

- **Symptom**: `column "embedding_vector" cannot be cast automatically to type vector`
- **Root Cause**: SQLAlchemy's `sa.dialects.postgresql.VECTOR()` doesn't work in `op.create_table()`
- **Why**: Alembic can't serialize custom VECTOR type properly
- **Failed Attempts**:
  - Using `sa.dialects.postgresql.VECTOR()` → Import/serialization error
  - Creating as `TEXT` then `ALTER COLUMN` → Type casting error
- **Solution**: Use raw SQL with `op.execute()`:
  ```python
  op.execute("""
      CREATE TABLE document_embeddings (
          embedding_vector VECTOR NOT NULL,
          ...
      );
  """)
  ```

**Problem 4: IVFFlat Index on Empty Table**

- **Symptom**: `ERROR: column does not have dimensions`
- **Root Cause**: pgvector can't create IVFFlat index without data
- **Why**: Index needs sample data to determine vector dimensions
- **Solution**: Removed index from migration, documented manual creation after data insertion
- **Best Practice**: Create index after inserting first batch of embeddings

### Key Learnings

1. **Alembic Directory Structure Matters**: Migrations must be in `versions/` subdirectory
2. **pgvector Requires Superuser**: Regular users can't create extensions
3. **Custom Types Need Raw SQL**: SQLAlchemy can't always serialize custom types
4. **Vector Indexes Need Data**: Create IVFFlat/HNSW indexes after data insertion
5. **Environment Loading**: Explicitly load `.env` in migration scripts

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure all dependencies are installed and paths are correct
2. **Database Connection**: Verify `CA_DATABASE_URL` environment variable
3. **OpenAI API Limits**: Implement rate limiting and error handling
4. **Memory Issues**: Reduce chunk sizes for large documents
5. **pgvector Extension Missing**:
   ```bash
   # Install in container
   docker exec ca-postgres apt install -y postgresql-15-pgvector
   docker exec ca-postgres psql -U postgres -d climateadvisor -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```
6. **Migration Not Found**: Ensure migration files are in `migrations/versions/` directory
7. **Alembic Version Mismatch**:

   ```bash
   # Check current version
   ../.venv/Scripts/python.exe -m alembic current

   # Force to specific version if needed
   ../.venv/Scripts/python.exe -m alembic stamp 20250126_120000
   ```

### Debug Mode

```bash
# Enable debug logging
CA_LOG_LEVEL=debug python upload_to_db.py
```

### Clean Slate Setup

If you need to completely reset the vector database:

```bash
# 1. Drop all tables
docker exec ca-postgres psql -U climateadvisor -d climateadvisor -c "DROP TABLE IF EXISTS document_embeddings CASCADE;"
docker exec ca-postgres psql -U climateadvisor -d climateadvisor -c "TRUNCATE TABLE alembic_version;"

# 2. Re-run migration
cd climate-advisor/vector_db
../.venv/Scripts/python.exe -m alembic upgrade head
```

## Production Deployment

### Database Setup Checklist

1. **Install pgvector in PostgreSQL**

   ```bash
   # For Docker deployments
   docker exec <postgres-container> apt update
   docker exec <postgres-container> apt install -y postgresql-15-pgvector

   # For managed databases (e.g., AWS RDS)
   # pgvector must be enabled by the cloud provider
   ```

2. **Create Extension (Requires Superuser)**

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. **Run Migrations**

   ```bash
   cd climate-advisor/vector_db
   python -m alembic upgrade head
   ```

4. **Verify Setup**
   ```bash
   python -m alembic current  # Should show: 20250126_120000 (head)
   ```

### Migration Reproducibility

The setup is **fully reproducible** with these guarantees:

✅ **Idempotent Operations**: All migrations use `IF NOT EXISTS` clauses  
✅ **Version Tracking**: Alembic tracks applied migrations in `alembic_version` table  
✅ **Rollback Support**: `alembic downgrade` available if needed  
✅ **Environment-Agnostic**: Works with local Docker or cloud databases

### CI/CD Integration

```bash
# In your deployment pipeline
cd climate-advisor/vector_db

# Check if migration is needed
python -m alembic current

# Run migrations
python -m alembic upgrade head

# Verify success
python -m alembic current | grep "20250126_120000 (head)"
```

## Security

- Store API keys securely using environment variables
- Validate file uploads to prevent malicious content
- Implement rate limiting for embedding generation
- Consider document access controls for sensitive content
- **pgvector Extension**: Requires PostgreSQL superuser to install
- **Database Access**: Use least-privilege principles for application users

## Future Enhancements

- Support for additional file formats (DOCX, TXT, HTML)
- Integration with other embedding providers (Cohere, Hugging Face)
- Advanced search features (filtering, ranking, hybrid search)
- Document versioning and incremental updates
- Vector database clustering for large-scale deployments
