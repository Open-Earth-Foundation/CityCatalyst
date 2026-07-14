"""Update modelled.city_action_mitigation_feasibility_scores SQL function.

Revision ID: ba244429bef5
Revises: 9a6d4b2e1f10
Create Date: 2026-05-21 11:28:26.063954

Adds strength_weight, raw_score, and headline score shrink:
  score = 0.5 + strength_weight * (raw_score - 0.5)

SQL is inlined so each revision is an immutable deploy snapshot. downgrade() restores
the v1 function from 9a6d4b2e1f10 (mean dimension score, no strength_weight shrink).
For local iteration, edit migrations/sql/city_action_mitigation_feasibility_scores.sql
and run it directly, or add a follow-up Alembic revision.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "ba244429bef5"
down_revision: Union[str, None] = "9a6d4b2e1f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UPGRADE_SQL = """
DROP FUNCTION IF EXISTS modelled.city_action_mitigation_feasibility_scores(
    varchar,
    uuid,
    varchar
);

CREATE OR REPLACE FUNCTION modelled.city_action_mitigation_feasibility_scores(
    p_locode varchar,
    p_release_id uuid,
    p_country_code varchar DEFAULT 'CL'
)
RETURNS TABLE (
    locode varchar,
    src_action_id varchar,
    global_mitigation_option text,
    action_mapping_strength varchar,
    strength_weight numeric,
    option_family varchar,
    score numeric,
    raw_score numeric,
    n_indicators_total integer,
    n_dims_scored integer,
    econ numeric,
    tech numeric,
    inst numeric,
    soc numeric,
    env numeric,
    geo numeric,
    breakdown jsonb,
    rank_within_city integer
)
LANGUAGE sql
STABLE
AS $$
WITH city_capacity AS (
    SELECT DISTINCT ON (ca.attribute_type)
        ca.locode,
        ca.attribute_type AS city_indicator,
        ca.attribute_category AS city_category,
        CASE ca.attribute_category
            WHEN 'very low' THEN 0.00::numeric
            WHEN 'low' THEN 0.25::numeric
            WHEN 'medium' THEN 0.50::numeric
            WHEN 'high' THEN 0.75::numeric
            WHEN 'very high' THEN 1.00::numeric
            ELSE NULL::numeric
        END AS city_capacity
    FROM modelled.city_attribute ca
    WHERE ca.locode = p_locode
      AND ca.country_code = p_country_code
      AND ca.attribute_category IN ('very low', 'low', 'medium', 'high', 'very high')
    ORDER BY ca.attribute_type, ca.datasource_date DESC NULLS LAST
),
action_metadata AS (
    SELECT DISTINCT
        c.src_action_id,
        c.global_mitigation_option,
        c.action_mapping_strength,
        c.option_family,
        CASE c.action_mapping_strength
            WHEN 'direct'        THEN 1.00::numeric
            WHEN 'partial'       THEN 0.95::numeric
            WHEN 'cross_cutting' THEN 0.90::numeric
            WHEN 'weak'          THEN 0.85::numeric
            WHEN 'no_match'      THEN 0.00::numeric
            ELSE 0.00::numeric
        END AS strength_weight
    FROM modelled.action_mitigation_feasibility_chain c
    WHERE c.release_id = p_release_id
      AND c.country_code = p_country_code
),
scorable_chain AS (
    SELECT
        c.src_action_id,
        c.feasibility_dimension,
        c.global_indicator,
        c.global_verdict_code,
        c.city_indicator,
        c.city_indicator_direction
    FROM modelled.action_mitigation_feasibility_chain c
    WHERE c.release_id = p_release_id
      AND c.country_code = p_country_code
      AND c.global_verdict_code IN ('A', 'C')
),
chain_x_city AS (
    SELECT
        c.src_action_id,
        c.feasibility_dimension,
        c.global_indicator,
        c.global_verdict_code,
        c.city_indicator,
        cv.city_category,
        cv.city_capacity,
        CASE c.city_indicator_direction
            WHEN 'positive' THEN 1
            WHEN 'negative' THEN -1
            ELSE 0
        END AS bridge_sign,
        CASE
            WHEN c.city_indicator_direction = 'positive' AND cv.city_capacity IS NOT NULL
                THEN 1.0::numeric * (2 * cv.city_capacity - 1)
            WHEN c.city_indicator_direction = 'negative' AND cv.city_capacity IS NOT NULL
                THEN -1.0::numeric * (2 * cv.city_capacity - 1)
            ELSE NULL::numeric
        END AS bridge_contribution
    FROM scorable_chain c
    LEFT JOIN city_capacity cv
      ON cv.city_indicator = c.city_indicator
),
indicator_scores AS (
    SELECT
        p_locode AS locode,
        src_action_id,
        feasibility_dimension,
        global_indicator,
        global_verdict_code,
        CASE global_verdict_code WHEN 'C' THEN 1::numeric ELSE -1::numeric END AS sr15_signal,
        AVG(bridge_contribution) FILTER (WHERE bridge_contribution IS NOT NULL) AS avg_contrib,
        COUNT(*) FILTER (WHERE bridge_contribution IS NOT NULL)::integer AS n_active_bridges,
        jsonb_agg(
            jsonb_build_object(
                'city_indicator', city_indicator,
                'category', city_category,
                'direction', CASE bridge_sign WHEN 1 THEN 'positive' WHEN -1 THEN 'negative' ELSE NULL END,
                'capacity', city_capacity,
                'contribution', ROUND(bridge_contribution, 3)
            )
            ORDER BY city_indicator
        ) FILTER (WHERE bridge_contribution IS NOT NULL) AS city_indicators
    FROM chain_x_city
    GROUP BY src_action_id, feasibility_dimension, global_indicator, global_verdict_code
),
indicators_with_score AS (
    SELECT
        *,
        CASE
            WHEN n_active_bridges > 0
                THEN ((sr15_signal + avg_contrib) / 2.0 + 1) / 2.0
            ELSE (sr15_signal + 1) / 2.0
        END AS indicator_score
    FROM indicator_scores
),
dimension_detail AS (
    SELECT
        locode,
        src_action_id,
        feasibility_dimension,
        ROUND(AVG(indicator_score), 3) AS dim_score,
        COUNT(*)::integer AS n_indicators,
        jsonb_agg(
            jsonb_build_object(
                'global_indicator', global_indicator,
                'global_verdict', CASE global_verdict_code
                    WHEN 'A' THEN 'barrier'
                    WHEN 'C' THEN 'supportive'
                    ELSE NULL
                END,
                'global_contribution', sr15_signal,
                'n_city_indicators', n_active_bridges,
                'avg_city_contribution', ROUND(avg_contrib, 3),
                'indicator_score', ROUND(indicator_score, 3),
                'city_indicators', COALESCE(city_indicators, '[]'::jsonb)
            )
            ORDER BY global_indicator
        ) AS global_indicators
    FROM indicators_with_score
    GROUP BY locode, src_action_id, feasibility_dimension
),
action_detail AS (
    SELECT
        locode,
        src_action_id,
        ROUND(AVG(dim_score), 3) AS raw_score,
        SUM(n_indicators)::integer AS n_indicators_total,
        COUNT(DISTINCT feasibility_dimension)::integer AS n_dims_scored,
        jsonb_object_agg(
            feasibility_dimension,
            jsonb_build_object(
                'dimension_score', dim_score,
                'n_global_indicators', n_indicators,
                'global_indicators', global_indicators
            )
        ) AS breakdown
    FROM dimension_detail
    GROUP BY locode, src_action_id
)
SELECT
    a.locode,
    a.src_action_id,
    m.global_mitigation_option,
    m.action_mapping_strength,
    m.strength_weight,
    m.option_family,
    ROUND(0.5 + COALESCE(m.strength_weight, 0::numeric) * (a.raw_score - 0.5), 3) AS score,
    a.raw_score,
    a.n_indicators_total,
    a.n_dims_scored,
    MAX(CASE WHEN d.feasibility_dimension = 'economic' THEN d.dim_score END) AS econ,
    MAX(CASE WHEN d.feasibility_dimension = 'technological' THEN d.dim_score END) AS tech,
    MAX(CASE WHEN d.feasibility_dimension = 'institutional' THEN d.dim_score END) AS inst,
    MAX(CASE WHEN d.feasibility_dimension = 'socio_cultural' THEN d.dim_score END) AS soc,
    MAX(CASE WHEN d.feasibility_dimension = 'environmental' THEN d.dim_score END) AS env,
    MAX(CASE WHEN d.feasibility_dimension = 'geophysical' THEN d.dim_score END) AS geo,
    a.breakdown,
    ROW_NUMBER() OVER (
        PARTITION BY a.locode
        ORDER BY (0.5 + COALESCE(m.strength_weight, 0::numeric) * (a.raw_score - 0.5)) DESC, a.src_action_id
    ) AS rank_within_city
FROM action_detail a
LEFT JOIN action_metadata m
  ON m.src_action_id = a.src_action_id
LEFT JOIN dimension_detail d
  ON a.locode = d.locode
 AND a.src_action_id = d.src_action_id
GROUP BY
    a.locode,
    a.src_action_id,
    m.global_mitigation_option,
    m.action_mapping_strength,
    m.strength_weight,
    m.option_family,
    a.raw_score,
    a.n_indicators_total,
    a.n_dims_scored,
    a.breakdown
ORDER BY a.locode, score DESC, a.src_action_id;
$$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


_DOWNGRADE_SQL = """
DROP FUNCTION IF EXISTS modelled.city_action_mitigation_feasibility_scores(
    varchar,
    uuid,
    varchar
);

CREATE OR REPLACE FUNCTION modelled.city_action_mitigation_feasibility_scores(
    p_locode varchar,
    p_release_id uuid,
    p_country_code varchar DEFAULT 'CL'
)
RETURNS TABLE (
    locode varchar,
    src_action_id varchar,
    global_mitigation_option text,
    action_mapping_strength varchar,
    option_family varchar,
    score numeric,
    n_indicators_total integer,
    n_dims_scored integer,
    econ numeric,
    tech numeric,
    inst numeric,
    soc numeric,
    env numeric,
    geo numeric,
    breakdown jsonb,
    rank_within_city integer
)
LANGUAGE sql
STABLE
AS $$
WITH city_capacity AS (
    SELECT DISTINCT ON (ca.attribute_type)
        ca.locode,
        ca.attribute_type AS city_indicator,
        ca.attribute_category AS city_category,
        CASE ca.attribute_category
            WHEN 'very low' THEN 0.00::numeric
            WHEN 'low' THEN 0.25::numeric
            WHEN 'medium' THEN 0.50::numeric
            WHEN 'high' THEN 0.75::numeric
            WHEN 'very high' THEN 1.00::numeric
            ELSE NULL::numeric
        END AS city_capacity
    FROM modelled.city_attribute ca
    WHERE ca.locode = p_locode
      AND ca.country_code = p_country_code
      AND ca.attribute_category IN ('very low', 'low', 'medium', 'high', 'very high')
    ORDER BY ca.attribute_type, ca.datasource_date DESC NULLS LAST
),
action_metadata AS (
    SELECT DISTINCT
        c.src_action_id,
        c.global_mitigation_option,
        c.action_mapping_strength,
        c.option_family
    FROM modelled.action_mitigation_feasibility_chain c
    WHERE c.release_id = p_release_id
      AND c.country_code = p_country_code
),
scorable_chain AS (
    SELECT
        c.src_action_id,
        c.feasibility_dimension,
        c.global_indicator,
        c.global_verdict_code,
        c.city_indicator,
        c.city_indicator_direction
    FROM modelled.action_mitigation_feasibility_chain c
    WHERE c.release_id = p_release_id
      AND c.country_code = p_country_code
      AND c.global_verdict_code IN ('A', 'C')
),
chain_x_city AS (
    SELECT
        c.src_action_id,
        c.feasibility_dimension,
        c.global_indicator,
        c.global_verdict_code,
        c.city_indicator,
        cv.city_category,
        cv.city_capacity,
        CASE c.city_indicator_direction
            WHEN 'positive' THEN 1
            WHEN 'negative' THEN -1
            ELSE 0
        END AS bridge_sign,
        CASE
            WHEN c.city_indicator_direction = 'positive' AND cv.city_capacity IS NOT NULL
                THEN 1.0::numeric * (2 * cv.city_capacity - 1)
            WHEN c.city_indicator_direction = 'negative' AND cv.city_capacity IS NOT NULL
                THEN -1.0::numeric * (2 * cv.city_capacity - 1)
            ELSE NULL::numeric
        END AS bridge_contribution
    FROM scorable_chain c
    LEFT JOIN city_capacity cv
      ON cv.city_indicator = c.city_indicator
),
indicator_scores AS (
    SELECT
        p_locode AS locode,
        src_action_id,
        feasibility_dimension,
        global_indicator,
        global_verdict_code,
        CASE global_verdict_code WHEN 'C' THEN 1::numeric ELSE -1::numeric END AS sr15_signal,
        AVG(bridge_contribution) FILTER (WHERE bridge_contribution IS NOT NULL) AS avg_contrib,
        COUNT(*) FILTER (WHERE bridge_contribution IS NOT NULL)::integer AS n_active_bridges,
        jsonb_agg(
            jsonb_build_object(
                'city_indicator', city_indicator,
                'category', city_category,
                'direction', CASE bridge_sign WHEN 1 THEN 'positive' WHEN -1 THEN 'negative' ELSE NULL END,
                'capacity', city_capacity,
                'contribution', ROUND(bridge_contribution, 3)
            )
            ORDER BY city_indicator
        ) FILTER (WHERE bridge_contribution IS NOT NULL) AS city_indicators
    FROM chain_x_city
    GROUP BY src_action_id, feasibility_dimension, global_indicator, global_verdict_code
),
indicators_with_score AS (
    SELECT
        *,
        CASE
            WHEN n_active_bridges > 0
                THEN ((sr15_signal + avg_contrib) / 2.0 + 1) / 2.0
            ELSE (sr15_signal + 1) / 2.0
        END AS indicator_score
    FROM indicator_scores
),
dimension_detail AS (
    SELECT
        locode,
        src_action_id,
        feasibility_dimension,
        ROUND(AVG(indicator_score), 3) AS dim_score,
        COUNT(*)::integer AS n_indicators,
        jsonb_agg(
            jsonb_build_object(
                'global_indicator', global_indicator,
                'global_verdict', CASE global_verdict_code
                    WHEN 'A' THEN 'barrier'
                    WHEN 'C' THEN 'supportive'
                    ELSE NULL
                END,
                'global_contribution', sr15_signal,
                'n_city_indicators', n_active_bridges,
                'avg_city_contribution', ROUND(avg_contrib, 3),
                'indicator_score', ROUND(indicator_score, 3),
                'city_indicators', COALESCE(city_indicators, '[]'::jsonb)
            )
            ORDER BY global_indicator
        ) AS global_indicators
    FROM indicators_with_score
    GROUP BY locode, src_action_id, feasibility_dimension
),
action_detail AS (
    SELECT
        locode,
        src_action_id,
        ROUND(AVG(dim_score), 3) AS score,
        SUM(n_indicators)::integer AS n_indicators_total,
        COUNT(DISTINCT feasibility_dimension)::integer AS n_dims_scored,
        jsonb_object_agg(
            feasibility_dimension,
            jsonb_build_object(
                'dimension_score', dim_score,
                'n_global_indicators', n_indicators,
                'global_indicators', global_indicators
            )
        ) AS breakdown
    FROM dimension_detail
    GROUP BY locode, src_action_id
)
SELECT
    a.locode,
    a.src_action_id,
    m.global_mitigation_option,
    m.action_mapping_strength,
    m.option_family,
    a.score,
    a.n_indicators_total,
    a.n_dims_scored,
    MAX(CASE WHEN d.feasibility_dimension = 'economic' THEN d.dim_score END) AS econ,
    MAX(CASE WHEN d.feasibility_dimension = 'technological' THEN d.dim_score END) AS tech,
    MAX(CASE WHEN d.feasibility_dimension = 'institutional' THEN d.dim_score END) AS inst,
    MAX(CASE WHEN d.feasibility_dimension = 'socio_cultural' THEN d.dim_score END) AS soc,
    MAX(CASE WHEN d.feasibility_dimension = 'environmental' THEN d.dim_score END) AS env,
    MAX(CASE WHEN d.feasibility_dimension = 'geophysical' THEN d.dim_score END) AS geo,
    a.breakdown,
    ROW_NUMBER() OVER (PARTITION BY a.locode ORDER BY a.score DESC, a.src_action_id) AS rank_within_city
FROM action_detail a
LEFT JOIN action_metadata m
  ON m.src_action_id = a.src_action_id
LEFT JOIN dimension_detail d
  ON a.locode = d.locode
 AND a.src_action_id = d.src_action_id
GROUP BY
    a.locode,
    a.src_action_id,
    m.global_mitigation_option,
    m.action_mapping_strength,
    m.option_family,
    a.score,
    a.n_indicators_total,
    a.n_dims_scored,
    a.breakdown
ORDER BY a.locode, a.score DESC, a.src_action_id;
$$;
"""


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
