"""Report the stored city population on Concept Note runs built before CC-948.

Runs built earlier keep the CityCatalyst population in their context bundle but
lack ``city_population`` in their progress summary, which the workspace reads
as "not included in run". This backfills the field from the stored bundle.

Revision ID: 20260925_120000
Revises: 20260811_120000
Create Date: 2026-09-25 12:00:00.000000
"""

from alembic import op

revision = "20260925_120000"
down_revision = "20260811_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add ``city_population`` to bundle progress that predates the field."""
    # Mirror the runtime rule: report a population only with its year.
    op.execute(
        """
        UPDATE concept_note_runs AS run
        SET context_summary = jsonb_set(
            run.context_summary,
            '{context_bundle,city_population}',
            CASE
                WHEN jsonb_typeof(bundle.context_bundle #> '{cc_context,city,population}') = 'number'
                    AND jsonb_typeof(bundle.context_bundle #> '{cc_context,city,population_year}') = 'number'
                THEN jsonb_build_object(
                    'population', bundle.context_bundle #> '{cc_context,city,population}',
                    'year', bundle.context_bundle #> '{cc_context,city,population_year}'
                )
                ELSE 'null'::jsonb
            END
        )
        FROM concept_note_context_bundles AS bundle
        WHERE bundle.run_id = run.run_id
            AND jsonb_typeof(run.context_summary -> 'context_bundle') = 'object'
            AND NOT (run.context_summary -> 'context_bundle') ? 'city_population'
        """
    )


def downgrade() -> None:
    """Keep the derived field; earlier code ignores it."""
