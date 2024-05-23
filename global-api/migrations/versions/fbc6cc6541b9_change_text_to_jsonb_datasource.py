"""change_text_to_jsonb_datasource

Revision ID: fbc6cc6541b9
Revises: 77d1cb7b24df
Create Date: 2024-05-22 08:44:41.670233

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fbc6cc6541b9'
down_revision: Union[str, None] = '77d1cb7b24df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('datasource', 'dataset_name')
    op.drop_column('datasource', 'dataset_description')
    op.drop_column('datasource', 'methodology_description')
    op.drop_column('datasource', 'transformation_description')

    op.add_column('datasource', sa.Column('dataset_name', postgresql.JSONB))
    op.add_column('datasource', sa.Column('dataset_description', postgresql.JSONB))
    op.add_column('datasource', sa.Column('methodology_description', postgresql.JSONB))
    op.add_column('datasource', sa.Column('transformation_description', postgresql.JSONB))


def downgrade() -> None:
    op.drop_column('datasource', 'dataset_name')
    op.drop_column('datasource', 'dataset_description')
    op.drop_column('datasource', 'methodology_description')
    op.drop_column('datasource', 'transformation_description')

    op.add_column('datasource', sa.Column('dataset_name', sa.TEXT))
    op.add_column('datasource', sa.Column('dataset_description', sa.TEXT))
    op.add_column('datasource', sa.Column('methodology_description', sa.TEXT))
    op.add_column('datasource', sa.Column('transformation_description', sa.TEXT))
