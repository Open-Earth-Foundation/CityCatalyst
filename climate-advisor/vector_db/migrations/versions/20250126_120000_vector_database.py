"""Vector database schema for embeddings

Revision ID: 20250126_120000
Revises: 20250118_120000
Create Date: 2025-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

try:
    from sqlalchemy.dialects.postgresql import UUID
except ImportError:
    # Fallback for non-PostgreSQL databases
    from sqlalchemy.types import String as UUID


# revision identifiers, used by Alembic.
revision = '20250126_120000'
down_revision = None  # Independent - runs on any database
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade the database schema with pgvector support for embeddings."""

    # Create pgvector extension if it doesn't exist
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create document_embeddings table directly with raw SQL to use VECTOR type
    op.execute("""
        CREATE TABLE document_embeddings (
            embedding_id VARCHAR(36) PRIMARY KEY,
            model_name VARCHAR(100) NOT NULL,
            embedding_vector VECTOR NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
    """)

    # Create indexes for document_embeddings table
    op.create_index('ix_document_embeddings_model_name', 'document_embeddings', ['model_name'])

    # Note: Vector index will be created after data is inserted
    # pgvector requires data to calculate dimensions and build index
    # This can be added later with:
    # CREATE INDEX ix_document_embeddings_vector ON document_embeddings
    # USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);


def downgrade() -> None:
    """Downgrade the database schema."""

    # Drop index
    op.drop_index('ix_document_embeddings_model_name', table_name='document_embeddings')

    # Drop table
    op.drop_table('document_embeddings')
