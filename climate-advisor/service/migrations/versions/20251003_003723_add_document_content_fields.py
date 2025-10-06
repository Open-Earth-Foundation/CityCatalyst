"""Add filename and chunk_content fields to document_embeddings

Revision ID: 20251003_003723
Revises: 20250118_120000
Create Date: 2025-10-03 00:37:23.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251003_003723'
down_revision = '20250118_120000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add filename, chunk_content, and related metadata fields to document_embeddings."""
    
    # Add document metadata columns
    op.add_column('document_embeddings', 
        sa.Column('filename', sa.String(length=500), nullable=False, server_default='untitled_document.pdf')
    )
    op.add_column('document_embeddings', 
        sa.Column('file_path', sa.String(length=1000), nullable=True)
    )
    op.add_column('document_embeddings', 
        sa.Column('file_type', sa.String(length=50), nullable=False, server_default='pdf')
    )
    
    # Add chunk content and metadata
    op.add_column('document_embeddings', 
        sa.Column('chunk_content', sa.Text(), nullable=False, server_default='')
    )
    op.add_column('document_embeddings', 
        sa.Column('chunk_index', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column('document_embeddings', 
        sa.Column('chunk_size', sa.Integer(), nullable=False, server_default='0')
    )
    
    # Create indexes for better query performance
    op.create_index('ix_document_embeddings_filename', 'document_embeddings', ['filename'])
    op.create_index('ix_document_embeddings_filename_chunk', 'document_embeddings', ['filename', 'chunk_index'])
    
    # Remove server defaults after adding columns (for future inserts to be explicit)
    op.alter_column('document_embeddings', 'filename', server_default=None)
    op.alter_column('document_embeddings', 'file_type', server_default=None)
    op.alter_column('document_embeddings', 'chunk_content', server_default=None)
    op.alter_column('document_embeddings', 'chunk_index', server_default=None)
    op.alter_column('document_embeddings', 'chunk_size', server_default=None)


def downgrade() -> None:
    """Remove filename, chunk_content, and related metadata fields from document_embeddings."""
    
    # Drop indexes
    op.drop_index('ix_document_embeddings_filename_chunk', table_name='document_embeddings')
    op.drop_index('ix_document_embeddings_filename', table_name='document_embeddings')
    
    # Drop columns
    op.drop_column('document_embeddings', 'chunk_size')
    op.drop_column('document_embeddings', 'chunk_index')
    op.drop_column('document_embeddings', 'chunk_content')
    op.drop_column('document_embeddings', 'file_type')
    op.drop_column('document_embeddings', 'file_path')
    op.drop_column('document_embeddings', 'filename')

