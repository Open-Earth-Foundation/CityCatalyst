"""add-datasource-and-publisher-tables

Revision ID: 66e9fef4a07a
Revises: 64eb87bae0a3
Create Date: 2023-10-23 13:35:27.589057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = '66e9fef4a07a'
down_revision: Union[str, None] = '64eb87bae0a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("datasource",
        sa.Column("datasource_id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("publisher_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("url", sa.TEXT(), nullable=True),
        sa.Column("description", sa.TEXT(), nullable=True),
        sa.Column("access_type", sa.String(), nullable=True),
        sa.Column("geographical_location", sa.String(), nullable=True),
        sa.Column("start_year", sa.Integer(), nullable=True),
        sa.Column("end_year", sa.Integer(), nullable=True),
        sa.Column("latest_accounting_year", sa.Integer(), nullable=True),
        sa.Column("frequency_of_update", sa.String(), nullable=True),
        sa.Column("spatial_resolution", sa.String(), nullable=True),
        sa.Column("language", sa.String(), nullable=True),
        sa.Column("accessibility", sa.String(), nullable=True),
        sa.Column("data_quality", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("units", sa.String(), nullable=True),
        sa.Column("methodology_url", sa.TEXT(), nullable=True),
        sa.Column("retrieval_method", sa.String(), nullable=True),
        sa.Column("api_endpoint", sa.String(), nullable=True),
        sa.Column("gpc_reference_number", sa.String(), nullable=True),
        sa.Column("created_date", sa.DateTime(), server_default=text('CURRENT_TIMESTAMP')),
        sa.Column("modified_date", sa.DateTime(), server_default=text('CURRENT_TIMESTAMP')),
    )


def downgrade() -> None:
    op.drop_table("datasource")

