"""add is_latest to dataset_release

Revision ID: c3a1d7f82e05
Revises: 8bf4006fa0b4
Create Date: 2026-03-31 00:00:00.000000

Adds an is_latest boolean flag to modelled.dataset_release so that API
routes can select the current release without hard-coding version_label.

A partial unique index enforces that at most one release per dataset can
be marked is_latest = true at the database level.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3a1d7f82e05'
down_revision: Union[str, None] = '8bf4006fa0b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'dataset_release',
        sa.Column(
            'is_latest',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema='modelled',
    )

    # Enforce only one latest release per dataset at the DB level.
    # A partial unique index only covers rows where is_latest = true,
    # so multiple non-latest rows for the same dataset are still allowed.
    op.create_index(
        'uix_dataset_release_one_latest',
        'dataset_release',
        ['dataset_id'],
        unique=True,
        schema='modelled',
        postgresql_where=sa.text('is_latest = true'),
    )


def downgrade() -> None:
    op.drop_index(
        'uix_dataset_release_one_latest',
        table_name='dataset_release',
        schema='modelled',
    )

    op.drop_column(
        'dataset_release',
        'is_latest',
        schema='modelled',
    )
