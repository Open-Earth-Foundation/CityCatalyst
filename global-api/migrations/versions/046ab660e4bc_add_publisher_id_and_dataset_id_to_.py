"""add_publisher_id_and_dataset_id_to_emissions_factor

Revision ID: 046ab660e4bc
Revises: 3fcc7f5218ed
Create Date: 2025-06-20 15:45:06.325795

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '046ab660e4bc'
down_revision: Union[str, None] = '3fcc7f5218ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add publisher_id and dataset_id columns to emissions_factor table
    op.add_column('emissions_factor', 
        sa.Column('publisher_id', postgresql.UUID(as_uuid=True), nullable=True),
        schema='modelled'
    )
    op.add_column('emissions_factor', 
        sa.Column('dataset_id', postgresql.UUID(as_uuid=True), nullable=True),
        schema='modelled'
    )
    


def downgrade() -> None:
    
    # Drop columns
    op.drop_column('emissions_factor', 'dataset_id', schema='modelled')
    op.drop_column('emissions_factor', 'publisher_id', schema='modelled')
