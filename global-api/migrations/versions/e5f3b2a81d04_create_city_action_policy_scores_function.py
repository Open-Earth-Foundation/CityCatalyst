"""Create modelled.city_action_policy_scores(locode, release_id) SQL function.

Revision ID: e5f3b2a81d04
Revises: d4e8a1c92f03
Create Date: 2026-05-19 00:00:00.000000

Computes per-city action policy scores from modelled.action_policy_signals using
scoring_rubric v0.2.0 (K=4.0, relevance cap). SQL inlined as an immutable deploy
snapshot; migrations/sql/city_action_policy_scores.sql is the local working copy.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "e5f3b2a81d04"
down_revision: Union[str, None] = "d4e8a1c92f03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UPGRADE_SQL = """
-- Per-city policy scoring from modelled.action_policy_signals.
-- Implements scoring_rubric.md v0.2.0 (K=4.0, relevance cap).
-- Returns one row per (action × top-N evidence); aggregate columns repeat per action.

CREATE OR REPLACE FUNCTION modelled.city_action_policy_scores(
    p_locode varchar,
    p_release_id uuid,
    p_top_evidence_limit integer DEFAULT 5
)
RETURNS TABLE (
    locode varchar,
    city_name text,
    src_action_id varchar,
    policy_support_score numeric,
    policy_support_category varchar,
    signal_type varchar,
    signal_relation varchar,
    signal_strength varchar,
    best_relevance varchar,
    n_findings integer,
    n_docs integer,
    sum_strength numeric,
    evidence_rank integer,
    policy_signal_id uuid,
    document_name text,
    document_type varchar,
    doc_relevance varchar,
    explicitness varchar,
    page integer,
    evidence_strength numeric,
    evidence_text text
)
LANGUAGE sql
STABLE
AS $$
WITH
target_city AS (
    SELECT
        cp.locode,
        cp.city_name AS comuna_name,
        LPAD(
            NULLIF(REGEXP_REPLACE(COALESCE(cp.region_code, ''), '[^0-9]', '', 'g'), ''),
            2,
            '0'
        ) AS region_code,
        cp.city_id AS comuna_code,
        cp.country_code
    FROM modelled.city_polygon cp
    WHERE cp.locode = p_locode
    LIMIT 1
),
signals AS (
    SELECT
        aps.policy_signal_id,
        aps.src_action_id AS action_id,
        aps.location_scope,
        aps.location_code,
        aps.document_name,
        aps.document_type,
        aps.doc_relevance,
        aps.signal_type,
        LOWER(aps.signal_relation) AS signal_relation,
        aps.signal_strength,
        COALESCE(LOWER(aps.explicitness), 'explicit') AS explicitness,
        aps.evidence_text,
        aps.page
    FROM modelled.action_policy_signals aps
    WHERE aps.release_id = p_release_id
      AND length(aps.evidence_text) > 30
),
proximity_weights(source_level, document_type, weight) AS (
    VALUES
        ('municipal', 'paccc', 1.00::numeric),
        ('communal', 'environmental_program', 1.00::numeric),
        ('intercommunal', 'territorial_plan', 0.85::numeric),
        ('regional', 'parcc', 0.70::numeric),
        ('regional', 'territorial_plan', 0.55::numeric),
        ('national', 'sector_plan', 0.50::numeric),
        ('national', 'framework', 0.35::numeric),
        ('national', 'territorial_plan', 0.25::numeric)
),
strength_weights(signal_strength, weight) AS (
    VALUES
        ('high', 1.00::numeric),
        ('medium', 0.60::numeric),
        ('low', 0.30::numeric)
),
relation_weights(signal_relation, weight) AS (
    VALUES
        ('commits', 1.00::numeric),
        ('targets', 1.00::numeric),
        ('target', 1.00::numeric),
        ('funds', 1.00::numeric),
        ('monitors', 0.80::numeric),
        ('monitor', 0.80::numeric),
        ('monitoring', 0.80::numeric),
        ('governs', 0.80::numeric),
        ('prioritizes', 0.70::numeric),
        ('identifies', 0.50::numeric),
        ('risk', 0.50::numeric),
        ('references', 0.40::numeric),
        ('contextualizes', 0.40::numeric),
        ('restates', 0.30::numeric),
        ('action', 1.00::numeric)
),
explicitness_weights(explicitness, weight) AS (
    VALUES
        ('explicit', 1.00::numeric),
        ('inferred', 0.60::numeric)
),
applicable AS (
    SELECT s.*
    FROM signals s
    CROSS JOIN target_city t
    WHERE
        s.location_scope = 'national'
        OR (
            s.location_scope = 'regional'
            AND s.location_code IN (t.region_code, LPAD(t.region_code, 2, '0'))
        )
        OR (
            s.location_scope = 'municipal'
            AND s.location_code IN (
                t.locode,
                t.comuna_code,
                LPAD(COALESCE(t.comuna_code, ''), 5, '0')
            )
        )
),
deduped AS (
    SELECT *
    FROM (
        SELECT
            a.*,
            ROW_NUMBER() OVER (
                PARTITION BY a.action_id, a.document_name, a.page
                ORDER BY
                    CASE a.signal_relation
                        WHEN 'commits' THEN 10
                        WHEN 'targets' THEN 10
                        WHEN 'target' THEN 10
                        WHEN 'funds' THEN 10
                        WHEN 'action' THEN 10
                        WHEN 'monitors' THEN 8
                        WHEN 'monitor' THEN 8
                        WHEN 'monitoring' THEN 8
                        WHEN 'governs' THEN 8
                        WHEN 'prioritizes' THEN 7
                        WHEN 'identifies' THEN 5
                        WHEN 'risk' THEN 5
                        WHEN 'references' THEN 4
                        WHEN 'contextualizes' THEN 4
                        WHEN 'restates' THEN 3
                        ELSE 0
                    END DESC,
                    CASE a.signal_strength
                        WHEN 'high' THEN 3
                        WHEN 'medium' THEN 2
                        ELSE 1
                    END DESC,
                    length(a.evidence_text) DESC
            ) AS rn
        FROM applicable a
    ) ranked
    WHERE rn = 1
),
scored AS (
    SELECT
        d.policy_signal_id,
        d.action_id,
        d.document_name,
        d.document_type,
        d.location_scope,
        d.doc_relevance,
        d.signal_type,
        d.signal_relation,
        d.signal_strength,
        d.explicitness,
        d.evidence_text,
        d.page,
        CASE
            WHEN d.document_name = 'National Determined Contributions' THEN 0.30::numeric
            ELSE pw.weight
        END AS proximity_weight,
        sw.weight AS strength_w,
        rw.weight AS relation_w,
        ew.weight AS explicitness_w,
        COALESCE(
            (
                CASE
                    WHEN d.document_name = 'National Determined Contributions' THEN 0.30::numeric
                    ELSE pw.weight
                END
            ) * sw.weight * rw.weight * ew.weight,
            0::numeric
        ) AS finding_strength
    FROM deduped d
    LEFT JOIN proximity_weights pw
        ON pw.source_level = CASE
            WHEN d.location_scope = 'municipal' AND d.document_type = 'environmental_program'
                THEN 'communal'
            ELSE d.location_scope
        END
        AND pw.document_type = d.document_type
    LEFT JOIN strength_weights sw ON sw.signal_strength = d.signal_strength
    LEFT JOIN relation_weights rw ON rw.signal_relation = d.signal_relation
    LEFT JOIN explicitness_weights ew ON ew.explicitness = d.explicitness
),
best_relevance AS (
    SELECT
        action_id,
        MAX(
            CASE doc_relevance
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 1
                ELSE 0
            END
        ) AS rel_rank
    FROM deduped
    WHERE doc_relevance IN ('high', 'medium', 'low')
    GROUP BY action_id
),
relevance_cap AS (
    SELECT
        action_id,
        CASE rel_rank
            WHEN 3 THEN 'high'
            WHEN 2 THEN 'medium'
            WHEN 1 THEN 'low'
            ELSE 'none'
        END AS best_relevance,
        CASE rel_rank
            WHEN 3 THEN 1.00::numeric
            WHEN 2 THEN 0.65::numeric
            WHEN 1 THEN 0.32::numeric
            ELSE 0.00::numeric
        END AS cap_value
    FROM best_relevance
),
action_scores AS (
    SELECT
        s.action_id,
        COUNT(*)::integer AS n_findings,
        COUNT(DISTINCT s.document_name)::integer AS n_docs,
        ROUND(SUM(s.finding_strength), 4) AS sum_strength,
        ROUND((1 - EXP(-SUM(s.finding_strength) / 4.0))::numeric, 4) AS score_uncapped,
        ROUND(
            LEAST(
                (1 - EXP(-SUM(s.finding_strength) / 4.0))::numeric,
                COALESCE(rc.cap_value, 0::numeric)
            ),
            4
        ) AS policy_score,
        rc.best_relevance
    FROM scored s
    LEFT JOIN relevance_cap rc ON rc.action_id = s.action_id
    WHERE s.finding_strength > 0
    GROUP BY s.action_id, rc.cap_value, rc.best_relevance
),
scored_actions AS (
    SELECT
        action_scores.*,
        CASE
            WHEN policy_score >= 0.66 THEN 'strong'
            WHEN policy_score >= 0.33 THEN 'medium'
            WHEN policy_score > 0 THEN 'weak'
            ELSE 'none'
        END AS policy_bucket
    FROM action_scores
),
top_evidence AS (
    SELECT *
    FROM (
        SELECT
            s.action_id,
            s.policy_signal_id,
            s.document_name,
            s.document_type,
            s.doc_relevance,
            s.signal_type,
            s.signal_relation,
            s.signal_strength,
            s.explicitness,
            s.page,
            s.evidence_text,
            ROUND(s.finding_strength, 4) AS evidence_strength,
            ROW_NUMBER() OVER (
                PARTITION BY s.action_id
                ORDER BY s.finding_strength DESC, s.page
            ) AS evidence_rank
        FROM scored s
        WHERE s.finding_strength > 0
    ) ranked
    WHERE evidence_rank <= GREATEST(COALESCE(p_top_evidence_limit, 5), 0)
)
SELECT
    tc.locode,
    tc.comuna_name AS city_name,
    sa.action_id AS src_action_id,
    sa.policy_score AS policy_support_score,
    sa.policy_bucket as policy_support_category,
    te.signal_type,
    te.signal_relation,
    te.signal_strength,
    sa.best_relevance,
    sa.n_findings,
    sa.n_docs,
    sa.sum_strength,
    te.evidence_rank,
    te.policy_signal_id,
    te.document_name,
    te.document_type,
    te.doc_relevance,
    te.explicitness,
    te.page,
    te.evidence_strength,
    te.evidence_text
FROM scored_actions sa
CROSS JOIN target_city tc
LEFT JOIN top_evidence te ON te.action_id = sa.action_id
ORDER BY sa.policy_score DESC, sa.action_id, te.evidence_rank;
$$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS modelled.city_action_policy_scores(
            varchar,
            uuid,
            integer
        );
        """
    )
