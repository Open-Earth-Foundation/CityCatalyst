"""formula_name_column_to_formulainput_table

Revision ID: 845b4eb9e3b7
Revises: 046ab660e4bc
Create Date: 2025-07-21 16:44:46.863163

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '845b4eb9e3b7'
down_revision: Union[str, None] = '046ab660e4bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column(
        'formula_input',
        sa.Column('formula_name', sa.String(), nullable=False),
        schema='modelled'
    )

def downgrade() -> None:
    op.drop_column(
        'formula_input', 
        'formula_name')