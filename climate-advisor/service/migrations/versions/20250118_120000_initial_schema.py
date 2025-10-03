"""Initial schema for Climate Advisor - includes service tables and vector database

Revision ID: 20250118_120000
Revises: 
Create Date: 2025-01-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

try:
    from sqlalchemy.dialects.postgresql import JSONB, UUID
except ImportError:
    print("Error importing UUID or JSONB")


# revision identifiers, used by Alembic.
revision = '20250118_120000'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade the database schema - includes service tables and vector database."""
    
    # ==================== PGVECTOR EXTENSION ====================
    # Create pgvector extension for vector embeddings support
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    
    # ==================== SERVICE TABLES ====================
    # Create threads table
    op.create_table(
        'threads',
        sa.Column('thread_id', UUID(), primary_key=True),  # type: ignore
        sa.Column('user_id', sa.String(length=255), nullable=False),
        sa.Column('inventory_id', sa.String(length=255), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('context', JSONB(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
        sa.Column(
            'last_updated',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
    )
    
    # Create indexes for threads table
    op.create_index('ix_threads_user_id', 'threads', ['user_id'])
    
    # Create messages table
    op.create_table(
        'messages',
        sa.Column('message_id', UUID(), primary_key=True),  # type: ignore
        sa.Column(
            'thread_id',
            UUID(),  # type: ignore
            sa.ForeignKey('threads.thread_id', ondelete='CASCADE'),
            nullable=False
        ),
        sa.Column('user_id', sa.String(length=255), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('tools_used', JSONB(), nullable=True),
        sa.Column('role', sa.Enum('user', 'assistant', 'system', name='message_role'), nullable=False, default='user'),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),
    )
    
    # Create indexes for messages table
    op.create_index('ix_messages_thread_id', 'messages', ['thread_id'])
    
    # ==================== VECTOR DATABASE TABLES ====================
    # Create document_embeddings table with pgvector support
    # Note: Using raw SQL because SQLAlchemy can't properly serialize VECTOR type
    op.execute("""
        CREATE TABLE document_embeddings (
            embedding_id UUID PRIMARY KEY,
            model_name TEXT NOT NULL,
            embedding_vector VECTOR NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
    """)

    # Create indexes for document_embeddings table
    op.create_index('ix_document_embeddings_model_name', 'document_embeddings', ['model_name'])
    
    # Note: Vector similarity index (IVFFlat) should be created after data is inserted
    # pgvector requires data to calculate dimensions and build the index
    # To create later, run:
    # CREATE INDEX ix_document_embeddings_vector ON document_embeddings
    # USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);


def downgrade() -> None:
    """Downgrade the database schema."""
    
    # ==================== DROP VECTOR DATABASE TABLES ====================
    # Drop vector database indexes first
    op.drop_index('ix_document_embeddings_model_name', table_name='document_embeddings')

    # Drop vector database tables
    op.drop_table('document_embeddings')
    
    # ==================== DROP SERVICE TABLES ====================
    # Drop service indexes first
    op.drop_index('ix_messages_thread_id', table_name='messages')
    op.drop_index('ix_threads_user_id', table_name='threads')

    # Drop service tables
    op.drop_table('messages')
    op.drop_table('threads')

    # Drop enum type
    op.execute('DROP TYPE IF EXISTS message_role')
    
    # ==================== DROP EXTENSIONS ====================
    # Drop pgvector extension (optional - may want to keep if other tables use it)
    # op.execute("DROP EXTENSION IF EXISTS vector")