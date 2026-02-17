"""dataset release schema

Revision ID: 91f5e49693dd
Revises: 92f76aa847c6
Create Date: 2026-02-17 13:43:43.591329

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = '91f5e49693dd'
down_revision: Union[str, None] = '92f76aa847c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create modelled.dataset_release table
    # publisher_datasource has composite PK (publisher_id, dataset_id), so FK must reference both
    op.create_table(
        'dataset_release',
        sa.Column('release_id', UUID(), nullable=False),
        sa.Column('publisher_id', UUID(), nullable=False),
        sa.Column('dataset_id', UUID(), nullable=False),
        sa.Column('version_label', sa.String(), nullable=False),
        sa.Column('released_at', sa.Date(), nullable=True),
        sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source_url', sa.String(), nullable=True),
        sa.Column('release_notes_url', sa.String(), nullable=True),
        sa.Column('metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('release_id'),
        sa.ForeignKeyConstraint(
            ['publisher_id', 'dataset_id'],
            ['modelled.publisher_datasource.publisher_id', 'modelled.publisher_datasource.dataset_id'],
            name='fk_dataset_release_dataset'
        ),
        sa.UniqueConstraint('publisher_id', 'dataset_id', 'version_label', name='uix_dataset_release_version'),
        schema='modelled'
    )

    # 2. Add dataset_slug to modelled.publisher_datasource
    op.add_column(
        'publisher_datasource',
        sa.Column('dataset_slug', sa.String(), nullable=True),
        schema='modelled'
    )

    # 3. Add method_id to modelled.activity_subcategory
    op.add_column(
        'activity_subcategory',
        sa.Column('method_id', UUID(), nullable=True),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_column('activity_subcategory', 'method_id', schema='modelled')
    op.drop_column('publisher_datasource', 'dataset_slug', schema='modelled')
    op.drop_table('dataset_release', schema='modelled')
