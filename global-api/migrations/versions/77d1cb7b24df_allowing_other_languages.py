"""allowing_other_languages

Revision ID: 77d1cb7b24df
Revises: 949c5b9cc18d
Create Date: 2024-05-01 13:06:46.227806

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = '77d1cb7b24df'
down_revision: Union[str, None] = '949c5b9cc18d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade():
    # Drop the old TEXT columns
    op.drop_column('datasource', 'dataset_name')
    op.drop_column('datasource', 'dataset_description')
    op.drop_column('datasource', 'methodology_description')
    op.drop_column('datasource', 'transformation_description')

    # Add the new jsonb columns with the original column names
    op.add_column('datasource', sa.Column('dataset_name', JSONB, nullable=True))
    op.add_column('datasource', sa.Column('dataset_description', JSONB, nullable=True))
    op.add_column('datasource', sa.Column('methodology_description', JSONB, nullable=True))
    op.add_column('datasource', sa.Column('transformation_description', JSONB, nullable=True))

def downgrade():
    # Drop the new jsonb columns
    op.drop_column('datasource', 'dataset_name')
    op.drop_column('datasource', 'dataset_description')
    op.drop_column('datasource', 'methodology_description')
    op.drop_column('datasource', 'transformation_description')

    # Add back the old TEXT columns
    op.add_column('datasource', sa.Column('dataset_name', sa.TEXT(), nullable=True))
    op.add_column('datasource', sa.Column('dataset_description', sa.Text(), nullable=True))
    op.add_column('datasource', sa.Column('methodology_description', sa.TEXT(), nullable=True))
    op.add_column('datasource', sa.Column('transformation_description', sa.TEXT(), nullable=True))
