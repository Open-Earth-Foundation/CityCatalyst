# Climate Advisor Vector Database

This directory contains the document-processing assets and reusable utilities
for Climate Advisor semantic search. Runtime persistence uses the shared
FastAPI database layer and the canonical `DocumentEmbedding` model in
`service/app/models/db/document_embedding.py`.

## Layout

```text
vector_db/
├── files/                    # Default input directory for PDF documents
├── services/
│   └── embedding_service.py # Batched OpenAI embedding generation
├── utils/
│   └── text_processing.py   # PDF extraction and text chunking
├── config_loader.py         # embedding_config.yml loader
├── embedding_config.yml     # Chunking, batch, and rate-limit settings
├── splitter_baseline.py     # Reusable splitter regression metrics
├── upload_to_db.py          # Reusable upload orchestration
└── vector_init.py           # Shared-session pgvector initialization
```

Runnable entrypoints live in `service/scripts/` and are always invoked as
modules. Database models and session management remain under `service/app/`;
Alembic revisions remain under `service/migrations/`.

## Configuration

Copy the environment template from the Climate Advisor project root and set
real values locally:

```bash
cp .env.example .env
```

Document upload requires:

- `CA_DATABASE_URL`: PostgreSQL connection URL. The local Compose default is
  `postgresql://climateadvisor:climateadvisor@localhost:5433/climateadvisor`.
- `OPENAI_API_KEY`: credential used only at runtime for embedding requests.

The embedding model is configured in `llm_config.yaml` under
`api.openai.embedding_model`. Chunk size, overlap, batch size, rate limit, and
the default input directory are configured in `vector_db/embedding_config.yml`.
Do not hardcode model names or credentials in Python modules.

## Local Setup

From `climate-advisor/`:

```bash
uv sync --locked --group dev
docker compose up -d --wait postgres
uv run --directory service python -m alembic upgrade head
```

The Compose PostgreSQL image already includes pgvector. Verify the extension,
table, and migration state with:

```bash
docker compose exec postgres psql -U climateadvisor -d climateadvisor -c '\dx vector'
docker compose exec postgres psql -U climateadvisor -d climateadvisor -c '\d document_embeddings'
uv run --directory service python -m alembic current
```

For local development only, the initialization helper can create the pgvector
extension and missing SQLAlchemy tables directly:

```bash
uv run --directory service python -m scripts.initialize_vector_db
```

Production and normal local setup should use Alembic instead.

## Uploading Documents

Place PDF files in `vector_db/files/`, or pass another directory. From the
project root:

```bash
uv run --directory service python -m scripts.upload_vector_documents
uv run --directory service python -m scripts.upload_vector_documents \
  --directory ../vector_db/files
```

Enable detailed operational logging with:

```bash
uv run --directory service python -m scripts.upload_vector_documents \
  --log-level DEBUG
```

The upload workflow:

1. Discovers PDF files in the selected directory.
2. Extracts text and splits it with the configured chunk size and overlap.
3. Generates embeddings with the model selected in `llm_config.yaml`.
4. Initializes pgvector through the shared async session when needed.
5. Writes one `document_embeddings` row per successfully embedded chunk.

Failures are logged. A database error rolls back the current document write;
individual provider failures are skipped and reported.

## Components

### Text processing

`utils/text_processing.py` provides:

- `PDFProcessor` for PDF text extraction.
- `TextSplitter` for production LangChain-backed chunking.
- `LocalRecursiveTextSplitter` for deterministic benchmark comparison.
- `DocumentProcessor` for file and directory orchestration.

### Embedding generation

`services/embedding_service.py` reads the OpenAI endpoint and embedding model
from centralized service settings. It handles token counting, batch requests,
rate limiting, and per-input result reporting.

### Persistence and search

- `upload_to_db.py` stores chunks using `app.db.session` and
  `app.models.db.document_embedding.DocumentEmbedding`.
- `vector_init.py` initializes pgvector through the same shared engine/session
  layer used by the FastAPI service.
- `service/app/tools/climate_vector_tool.py` performs similarity search for the
  runtime agent tool.
- `service/migrations/versions/20250118_120000_initial_schema.py` creates the
  initial vector table and extension; later revisions add document metadata and
  indexes.

## Splitter Baseline

Generate the committed splitter metrics format from the default fixture or a
custom UTF-8 file:

```bash
uv run --directory service python -m scripts.splitter_baseline
uv run --directory service python -m scripts.splitter_baseline \
  --fixture tests/fixtures/splitter_baseline/gpc_excerpt_multi_paragraph.txt \
  --output ../vector_db/splitter-baseline.json
```

The model used for tokenization comes from `llm_config.yaml`; the script uses a
stable tokenizer fallback when `tiktoken` does not recognize that model.

## Testing

Run the vector model, splitter, and RAG tool tests through pytest:

```bash
uv run --directory service pytest \
  tests/test_document_embedding_model.py \
  tests/test_text_splitter.py \
  tests/test_rag_tool.py -v
```

`tests/test_vector_db_insertion.py` is an integration test. It requires a
reachable PostgreSQL database configured through `CA_DATABASE_URL` and existing
uploaded embeddings; otherwise its database cases skip.

## Operational Notes

- Use Alembic for production schema changes; do not call `create_all()` during
  deployment.
- Create or tune IVFFlat/HNSW indexes only after evaluating the actual dataset.
- Reduce `default_chunk_size` if token-limit warnings appear.
- Keep uploaded source material and API credentials out of version control.
- Use least-privilege database credentials; extension installation may require
  elevated database privileges during infrastructure setup.
