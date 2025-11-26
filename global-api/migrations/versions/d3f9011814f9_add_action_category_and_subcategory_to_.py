"""add_action_category_and_subcategory_to_cap_climate_action

Revision ID: d3f9011814f9
Revises: f733336b38a6
Create Date: 2025-10-24 14:16:26.804214

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = 'd3f9011814f9'
down_revision: Union[str, None] = 'f733336b38a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Add action_category column with constraint
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        ADD COLUMN action_category VARCHAR;
    """))
    
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        ADD CONSTRAINT check_action_category 
        CHECK (
            action_category IS NULL OR 
            action_category IN (
                'Policies, Plans & Programs',
                'Projects & Physical Actions',
                'Data, Tools & Planning Projects'
            )
        );
    """))
    
    # Add action_subcategory column with constraint
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        ADD COLUMN action_subcategory VARCHAR;
    """))
    
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        ADD CONSTRAINT check_action_subcategory 
        CHECK (
            action_subcategory IS NULL OR 
            action_subcategory IN (
                'Regulation & Standards',
                'Public Programs / Incentives',
                'Strategic Plans',
                'Institutional Frameworks',
                'Infrastructure Development',
                'Energy & Building Retrofits',
                'Nature-Based Solutions',
                'Mobility & Transport Projects',
                'Emergency Infrastructure',
                'Data Collection / Baseline Studies',
                'Digital Tools & Platforms',
                'Tech Pilots & Deployments'
            )
        );
    """))


def downgrade() -> None:
    conn = op.get_bind()
    
    # Drop constraints first
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        DROP CONSTRAINT IF EXISTS check_action_subcategory;
    """))
    
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        DROP CONSTRAINT IF EXISTS check_action_category;
    """))
    
    # Drop columns
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        DROP COLUMN IF EXISTS action_subcategory;
    """))
    
    conn.execute(text("""
        ALTER TABLE modelled.cap_climate_action
        DROP COLUMN IF EXISTS action_category;
    """))
