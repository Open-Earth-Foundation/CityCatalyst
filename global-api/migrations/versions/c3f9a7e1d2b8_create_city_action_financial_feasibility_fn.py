"""create modelled.city_action_financial_feasibility(...) SR-function

The Chile climate-finance score, derived at read time from the base tables -- no stored view.
Per action for a city it returns the demand bandings (ACTION), the city axes (CITY, from
city_finance_profile or a neutral 0.5 fallback), fund_access (FINANCE, from finance_opportunity
matched by GPC sector), n_existing_projects (PROJECTS, from finance_project_action), and the
methodology B7 route + financial_feasibility. The function SQL is inlined here (single source of
truth) so this revision is an immutable deploy snapshot; change the function by adding a follow-up
revision (CREATE OR REPLACE), not by editing a side file.

Open items to confirm against live data (flagged in review):
  - action GPC sector is derived from action_pathway_mitigation_impact.gpc_reference_number
    (leading numeral -> GPC sector); confirm that JSONB shape and that actions resolve a sector.
  - investment_cost / intervention_type vocab (low/medium/high; regulatory/planning/program/
    financial/infrastructure) -- non-matching values band to the 0.5 midpoint.
  - "latest of each" release pinning via dataset_release.is_latest.

Revision ID: c3f9a7e1d2b8
Revises: b8e2f5a1c9d4
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c3f9a7e1d2b8"
down_revision: Union[str, None] = "b8e2f5a1c9d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
DROP FUNCTION IF EXISTS modelled.city_action_financial_feasibility(varchar, varchar);

CREATE OR REPLACE FUNCTION modelled.city_action_financial_feasibility(
    p_locode varchar,
    p_country_code varchar DEFAULT 'CL'
)
RETURNS TABLE (
    locode varchar,
    action_id varchar,
    action_name text,
    sector varchar,
    capital_intensity numeric,
    preparation_complexity numeric,
    city_profile text,
    city_layer text,
    route text,
    fund_access varchar,
    n_reachable_opportunities integer,
    n_existing_projects integer,
    financial_feasibility numeric
)
LANGUAGE sql
STABLE
AS $$
WITH latest AS (
    SELECT release_id FROM modelled.dataset_release WHERE is_latest
),
city AS (
    -- autonomy / capacity are used internally for the route maths only; the API returns the
    -- coarse city_profile category, not these SINIM-derived numerics.
    SELECT cfp.autonomy, cfp.capacity, cfp.city_archetype
    FROM modelled.city_finance_profile cfp
    WHERE cfp.actor_id = p_locode
      AND cfp.release_id IN (SELECT release_id FROM latest)
    LIMIT 1
),
ax AS (
    SELECT DISTINCT ON (ap.src_action_id)
        ap.pathway_id,
        ap.src_action_id AS action_id,
        ap.name_i18n->>'en' AS action_name,
        CASE lower(ap.investment_cost)
             WHEN 'low' THEN 0.2 WHEN 'medium' THEN 0.5 WHEN 'high' THEN 0.8 ELSE 0.5 END AS capital_intensity,
        CASE
            WHEN lower(ap.intervention_type) = 'regulatory' THEN 0.2
            WHEN lower(ap.intervention_type) IN ('planning','program','financial') THEN 0.5
            WHEN lower(ap.intervention_type) = 'infrastructure' AND lower(ap.investment_cost) = 'high' THEN 0.9
            WHEN lower(ap.intervention_type) = 'infrastructure' THEN 0.8
            ELSE 0.5 END AS preparation_complexity
    FROM modelled.action_pathway ap
    WHERE ap.release_id IN (SELECT release_id FROM latest)
      AND ap.src_action_id IS NOT NULL
    ORDER BY ap.src_action_id, ap.updated_at DESC
),
act_sector AS (
    SELECT DISTINCT ax.action_id,
        CASE
            WHEN ref LIKE 'I.%'   OR ref = 'I'   THEN 'stationary_energy'
            WHEN ref LIKE 'II.%'  OR ref = 'II'  THEN 'transportation'
            WHEN ref LIKE 'III.%' OR ref = 'III' THEN 'waste'
            WHEN ref LIKE 'IV.%'  OR ref = 'IV'  THEN 'ippu'
            WHEN ref LIKE 'V.%'   OR ref = 'V'   THEN 'afolu'
        END AS gpc_sector
    FROM ax
    JOIN modelled.action_pathway_mitigation_impact imp
      ON imp.pathway_id = ax.pathway_id
     AND imp.release_id IN (SELECT release_id FROM latest)
    CROSS JOIN LATERAL jsonb_array_elements_text(imp.gpc_reference_number) AS ref
),
prim_sector AS (
    SELECT DISTINCT ON (action_id) action_id, gpc_sector
    FROM act_sector
    WHERE gpc_sector IS NOT NULL
    ORDER BY action_id, gpc_sector
),
supply AS (
    SELECT s.action_id,
        CASE
            WHEN count(fo.opportunity_id) = 0 THEN 'gap'
            WHEN bool_or(fo.city_application ? 'direct') THEN 'direct'
            ELSE 'competitive'
        END AS fund_access,
        count(DISTINCT fo.opportunity_id)::int AS n_reachable_opportunities
    FROM act_sector s
    LEFT JOIN modelled.finance_opportunity fo
      ON fo.release_id IN (SELECT release_id FROM latest)
     AND fo.country_code = p_country_code
     AND fo.gpc_sectors ? s.gpc_sector
    WHERE s.gpc_sector IS NOT NULL
    GROUP BY s.action_id
),
precedent AS (
    SELECT fpa.action_id, count(DISTINCT fpa.project_id)::int AS n_existing_projects
    FROM modelled.finance_project_action fpa
    JOIN modelled.finance_project fp
      ON fp.project_id = fpa.project_id
     AND fp.release_id IN (SELECT release_id FROM latest)
     AND fp.country_code = p_country_code
    WHERE fpa.release_id IN (SELECT release_id FROM latest)
    GROUP BY fpa.action_id
),
assembled AS (
    SELECT
        ax.action_id, ax.action_name,
        ps.gpc_sector AS sector,
        ax.capital_intensity AS cap_d,
        ax.preparation_complexity AS form_d,
        COALESCE((SELECT autonomy FROM city), 0.5) AS auto,
        COALESCE((SELECT capacity FROM city), 0.5) AS cap,
        COALESCE(sp.fund_access, 'gap') AS fund_access,
        COALESCE(sp.n_reachable_opportunities, 0) AS n_reachable_opportunities,
        COALESCE(pr.n_existing_projects, 0) AS n_existing_projects
    FROM ax
    LEFT JOIN prim_sector ps ON ps.action_id = ax.action_id
    LEFT JOIN supply sp      ON sp.action_id = ax.action_id
    LEFT JOIN precedent pr   ON pr.action_id = ax.action_id
),
routed AS (
    SELECT a.*,
        CASE
            WHEN a.cap_d <= 0.2 AND (a.form_d - a.cap) > 0.05 THEN 'needs technical assistance'
            WHEN a.cap_d <= 0.2 THEN 'self-deliverable'
            WHEN (a.cap_d - a.auto) <= 0.05 AND (a.form_d - a.cap) <= 0.05 THEN 'own-budget feasible'
            WHEN (a.cap_d - a.auto) > 0.05 AND (a.form_d - a.cap) <= 0.05 THEN 'needs external co-finance'
            WHEN (a.form_d - a.cap) > 0.05 AND (a.cap_d - a.auto) <= 0.05 THEN 'needs technical assistance'
            ELSE 'needs external finance + TA / pooling'
        END AS route
    FROM assembled a
)
SELECT
    p_locode AS locode,
    r.action_id,
    r.action_name,
    r.sector,
    r.cap_d AS capital_intensity,
    r.form_d AS preparation_complexity,
    (SELECT city_archetype FROM city) AS city_profile,
    CASE WHEN EXISTS (SELECT 1 FROM city) THEN 'profiled' ELSE 'neutral-fallback' END AS city_layer,
    r.route,
    r.fund_access,
    r.n_reachable_opportunities,
    r.n_existing_projects,
    CASE r.route
        WHEN 'self-deliverable' THEN 1.0
        WHEN 'own-budget feasible' THEN 0.85
        WHEN 'needs technical assistance' THEN 0.70
        WHEN 'needs external co-finance' THEN
            CASE r.fund_access WHEN 'direct' THEN 0.60 WHEN 'competitive' THEN 0.45 ELSE 0.25 END
        ELSE
            CASE r.fund_access WHEN 'direct' THEN 0.35 WHEN 'competitive' THEN 0.30 ELSE 0.15 END
    END AS financial_feasibility
FROM routed r
ORDER BY financial_feasibility DESC, r.action_id;
$$;
"""

_DOWNGRADE_SQL = "DROP FUNCTION IF EXISTS modelled.city_action_financial_feasibility(varchar, varchar);"


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
