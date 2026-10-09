"""Attach chat threads to their owning Concept Note run.

Revision ID: 20260925_130000
Revises: 20260925_120000
Create Date: 2026-09-25 13:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260925_130000"
down_revision = "20260925_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Split legacy shared chats, then attach each chat to its owning run."""
    # Keep run pointers and history stable until this transaction commits.
    op.execute(
        "LOCK TABLE concept_note_runs, threads, messages IN ACCESS EXCLUSIVE MODE"
    )
    op.add_column(
        "threads",
        sa.Column(
            "concept_note_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "concept_note_runs.run_id",
                name="fk_threads_concept_note_run_id",
                ondelete="CASCADE",
            ),
            nullable=True,
            comment="Owning Concept Note run; NULL for general Climate Advisor chats",
        ),
    )
    # One legacy thread may serve several runs. Keep it for the oldest run and
    # give every other run an independent copy before backfilling ownership.
    # Execute inside PostgreSQL so offline Alembic SQL has the same safeguards.
    op.execute(
        sa.text(
            """
            DO $$
            DECLARE
                shared_run RECORD;
                new_thread_id UUID;
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM concept_note_runs AS runs
                    JOIN threads ON threads.thread_id = runs.thread_id
                    WHERE runs.user_id <> threads.user_id
                ) THEN
                    RAISE EXCEPTION 'Cannot migrate Concept Note chats: '
                        'run and thread owners differ; repair ownership first';
                END IF;

                FOR shared_run IN
                    SELECT run_id, thread_id
                    FROM (
                        SELECT runs.run_id, runs.thread_id,
                            row_number() OVER (
                                PARTITION BY runs.thread_id
                                ORDER BY runs.created_at, runs.run_id
                            ) AS position
                        FROM concept_note_runs AS runs
                        JOIN threads ON threads.thread_id = runs.thread_id
                    ) AS ranked
                    WHERE position > 1
                LOOP
                    new_thread_id := gen_random_uuid();
                    INSERT INTO threads (
                        thread_id, user_id, inventory_id, title, context,
                        created_at, last_updated
                    )
                    SELECT new_thread_id, user_id, inventory_id, title, context,
                        created_at, last_updated
                    FROM threads WHERE thread_id = shared_run.thread_id;

                    INSERT INTO messages (
                        message_id, thread_id, user_id, text, tools_used,
                        role, created_at
                    )
                    SELECT gen_random_uuid(), new_thread_id, user_id, text,
                        tools_used, role, created_at
                    FROM messages WHERE thread_id = shared_run.thread_id;

                    UPDATE concept_note_runs SET thread_id = new_thread_id
                    WHERE run_id = shared_run.run_id;
                END LOOP;
            END $$;
            """
        )
    )
    # Match the runtime workflow binding for originals and copies alike; keep
    # tokens and unrelated context, but remove the competing workflow scope.
    op.execute(
        sa.text(
            """
            UPDATE threads
            SET concept_note_run_id = runs.run_id,
                context = (COALESCE(NULLIF(threads.context, 'null'::jsonb), '{}'::jsonb)
                    - 'concept_note_run_id' - 'stationary_energy_draft_run_id')
                    || jsonb_build_object('concept_note_run_id', runs.run_id::text)
            FROM concept_note_runs AS runs
            WHERE runs.thread_id = threads.thread_id
            """
        )
    )
    op.create_index(
        "ix_threads_concept_note_run_created",
        "threads",
        ["concept_note_run_id", "created_at"],
    )


def downgrade() -> None:
    """Drop ownership; retain split chats and run pointers to preserve history."""
    op.drop_index("ix_threads_concept_note_run_created", table_name="threads")
    op.drop_column("threads", "concept_note_run_id")
