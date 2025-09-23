"""Initial schema for Climate Advisor

Revision ID: 20250118_120000
Revises: 
Create Date: 2025-01-18 12:00:00.000000

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
revision = '20250118_120000'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade the database schema."""
    # Create threads table
    op.create_table(
        'threads',
        sa.Column('thread_id', UUID(), primary_key=True),
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
        sa.Column('message_id', UUID(), primary_key=True),
        sa.Column(
            'thread_id',
            UUID(),
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


def downgrade() -> None:
    """Downgrade the database schema."""
    # Drop indexes first
    op.drop_index('ix_messages_thread_id', table_name='messages')
    op.drop_index('ix_threads_user_id', table_name='threads')

    # Drop tables
    op.drop_table('messages')
    op.drop_table('threads')

    # Drop enum type
    op.execute('DROP TYPE IF EXISTS message_role')