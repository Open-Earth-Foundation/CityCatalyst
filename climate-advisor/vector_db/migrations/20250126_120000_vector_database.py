"""Vector database schema for document storage and embeddings

Revision ID: 20250126_120000
Revises: 20250118_120000
Create Date: 2025-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

try:
    from sqlalchemy.dialects.postgresql import JSONB, UUID
except ImportError:
    # Fallback for non-PostgreSQL databases
    from sqlalchemy import JSON as JSONB
    from sqlalchemy.types import String as UUID


# revision identifiers, used by Alembic.
revision = '20250126_120000'
down_revision = '20250118_120000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade the database schema with vector support."""

    # Create pgvector extension if it doesn't exist
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create documents table
    op.create_table(
        'documents',
        sa.Column('document_id', UUID(), primary_key=True),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
    )

    # Create indexes for documents table
    op.create_index('ix_documents_filename', 'documents', ['filename'])
    op.create_index('ix_documents_file_type', 'documents', ['file_type'])

    # Create document_chunks table
    op.create_table(
        'document_chunks',
        sa.Column('chunk_id', UUID(), primary_key=True),
        sa.Column(
            'document_id',
            UUID(),
            sa.ForeignKey('documents.document_id', ondelete='CASCADE'),
            nullable=False
        ),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('metadata', JSONB(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
    )

    # Create indexes for document_chunks table
    op.create_index('ix_document_chunks_document_id', 'document_chunks', ['document_id'])
    op.create_index('ix_document_chunks_chunk_index', 'document_chunks', ['chunk_index'])

    # Create document_embeddings table
    op.create_table(
        'document_embeddings',
        sa.Column('embedding_id', UUID(), primary_key=True),
        sa.Column(
            'chunk_id',
            UUID(),
            sa.ForeignKey('document_chunks.chunk_id', ondelete='CASCADE'),
            nullable=False
        ),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('embedding_vector', sa.dialects.postgresql.VECTOR(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
    )

    # Create indexes for document_embeddings table
    op.create_index('ix_document_embeddings_chunk_id', 'document_embeddings', ['chunk_id'])
    op.create_index('ix_document_embeddings_model_name', 'document_embeddings', ['model_name'])

    # Create vector index for similarity search
    # This creates an IVFFlat index for fast approximate nearest neighbor search
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_document_embeddings_vector
        ON document_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
        WITH (lists = 100)
    """)


def downgrade() -> None:
    """Downgrade the database schema."""

    # Drop indexes first
    op.drop_index('ix_document_embeddings_vector', table_name='document_embeddings')
    op.drop_index('ix_document_embeddings_model_name', table_name='document_embeddings')
    op.drop_index('ix_document_embeddings_chunk_id', table_name='document_embeddings')
    op.drop_index('ix_document_chunks_chunk_index', table_name='document_chunks')
    op.drop_index('ix_document_chunks_document_id', table_name='document_chunks')
    op.drop_index('ix_documents_file_type', table_name='documents')
    op.drop_index('ix_documents_filename', table_name='documents')

    # Drop tables
    op.drop_table('document_embeddings')
    op.drop_table('document_chunks')
    op.drop_table('documents')
