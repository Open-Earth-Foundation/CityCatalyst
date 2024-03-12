"""datacatalog_updateV01

Revision ID: 191489d19e2a
Revises: 0ca75cb48d2c
Create Date: 2024-03-11 13:29:48.302595

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '191489d19e2a'
down_revision: Union[str, None] = '0ca75cb48d2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade():
    op.add_column('datasource', sa.Column("datasource_name", sa.String(), nullable=True))
    op.add_column('datasource', sa.Column("dataset_name", sa.TEXT(), nullable=True))
    op.add_column('datasource', sa.Column("methodology_description", sa.TEXT(), nullable=True))
    op.add_column('datasource', sa.Column("transformation_description", sa.TEXT(), nullable=True))
    op.add_column('datasource', sa.Column("scope", sa.String(), nullable=True))
    op.alter_column("datasource", "url", new_column_name="dataset_url")
    op.drop_column("datasource", "name")
    op.drop_column("datasource", "description")

def downgrade():
    op.drop_column('datasource', 'datasource_name')
    op.drop_column('datasource', 'dataset_name')
    op.drop_column('datasource', 'methodology_description')
    op.drop_column('datasource', 'transformation_description')
    op.drop_column('datasource', 'scope')
    op.alter_column("datasource", "dataset_url", new_column_name="url")
    op.add_column("datasource", sa.Column("name", sa.String(), nullable=True))
    op.add_column("datasource", sa.Column("description", sa.TEXT(), nullable=True))

