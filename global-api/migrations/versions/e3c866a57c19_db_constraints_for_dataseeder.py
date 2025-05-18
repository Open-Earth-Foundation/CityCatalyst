"""db constraints for dataseeder

Revision ID: e3c866a57c19
Revises: 753dc7da2be2
Create Date: 2025-05-18 12:47:27.656183

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg


# revision identifiers, used by Alembic.
revision: str = 'e3c866a57c19'
down_revision: Union[str, None] = '753dc7da2be2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Add constraints and modify columns in datasource table
    op.alter_column('datasource', 'datasource_name', nullable=False)
    op.alter_column('datasource', 'dataset_name', type_=pg.JSONB, nullable=False)
    op.alter_column('datasource', 'dataset_description', type_=pg.JSONB)
    op.alter_column('datasource', 'geographical_location', nullable=False)
    op.alter_column('datasource', 'start_year', nullable=False)
    op.alter_column('datasource', 'end_year', nullable=False)
    op.alter_column('datasource', 'spatial_resolution', nullable=False)
    op.alter_column('datasource', 'data_quality', nullable=False)
    op.alter_column('datasource', 'units', nullable=False)
    op.alter_column('datasource', 'methodology_description', type_=pg.JSONB, nullable=False)
    op.alter_column('datasource', 'transformation_description', type_=pg.JSONB, nullable=False)
    op.alter_column('datasource', 'api_endpoint', nullable=False)
    op.alter_column('datasource', 'gpc_reference_number', nullable=False)
    op.create_check_constraint(
        "check_frequency_of_update",
        "datasource",
        "frequency_of_update IN ('daily', 'annual', 'monthly')"
    )
    op.create_check_constraint(
            "check_data_quality",
            "datasource",
            "data_quality IN ('high', 'medium', 'low')"
        )
    op.create_check_constraint(
                "check_units",
                "datasource",
                "units = 'kg'"
            )
    # Adding check constraints for 'source_type'
    op.create_check_constraint(
                    "check_source_type",
                    "datasource",
                    "source_type IN ('Third-party', 'third_party')"
                )
    op.create_check_constraint(
                        "check_access_type",
                        "datasource",
                        "access_type IN ('public', 'private', 'globalapi')"
                    )
    op.create_check_constraint(
                        "check_accessibility",
                        "datasource",
                        "(accessibility IS NULL OR accessibility IN ('paid', 'free'))"
                    )
    op.create_check_constraint(
                                "check_retrieval_method",
                                "datasource",
                                "retrieval_method IN ('global_api', 'global_api_downscaled_by_population')"
    )
    op.create_check_constraint(
            "check_scope",
            "datasource",
            "scope IN ('1', '2', '3')"
        )

def downgrade() -> None:
    # Drop the check constraints added during the upgrade
    op.drop_constraint("check_scope", "datasource", type_='check')
    op.drop_constraint("check_retrieval_method", "datasource", type_='check')
    op.drop_constraint("check_accessibility", "datasource", type_='check')
    op.drop_constraint("check_access_type", "datasource", type_='check')
    op.drop_constraint("check_source_type", "datasource", type_='check')
    op.drop_constraint("check_units", "datasource", type_='check')
    op.drop_constraint("check_data_quality", "datasource", type_='check')
    op.drop_constraint("check_frequency_of_update", "datasource", type_='check')

    # Revert column alterations
    op.alter_column('datasource', 'gpc_reference_number', nullable=True)
    op.alter_column('datasource', 'api_endpoint', nullable=True)
    op.alter_column('datasource', 'transformation_description', type_=pg.JSONB, nullable=True)
    op.alter_column('datasource', 'methodology_description', type_=pg.JSONB, nullable=True)
    op.alter_column('datasource', 'units', nullable=True)
    op.alter_column('datasource', 'data_quality', nullable=True)
    op.alter_column('datasource', 'spatial_resolution', nullable=True)
    op.alter_column('datasource', 'end_year', nullable=True)
    op.alter_column('datasource', 'start_year', nullable=True)
    op.alter_column('datasource', 'geographical_location', nullable=True)
    op.alter_column('datasource', 'dataset_description', type_=pg.JSONB, nullable=True)
    op.alter_column('datasource', 'dataset_name', type_=pg.JSONB, nullable=True)
    op.alter_column('datasource', 'datasource_name', nullable=True)
