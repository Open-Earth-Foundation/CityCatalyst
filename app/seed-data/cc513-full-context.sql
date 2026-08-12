-- CC-513 full-stack context-bundle demo additions.
--
-- Run only against a disposable local database cloned from the CityCatalyst
-- demo database. The statements rely on the existing New York demo city,
-- inventory, user, sectors, subsectors, and its GPC I/II/III/V values. They add
-- one GPC IV value and persisted mitigation/adaptation HIAP rankings so a real
-- application run can exercise PDF + GHGI + HIAP bundle assembly.

BEGIN;

UPDATE "Inventory"
SET inventory_type = 'gpc_basic_plus',
    last_updated = '2026-08-12 22:00:00+00'
WHERE inventory_id = '58830000-0000-4000-8000-000000000004';

INSERT INTO "InventoryValue" (
    id,
    co2eq,
    inventory_id,
    created,
    last_updated,
    gpc_reference_number,
    sector_id,
    sub_sector_id
)
VALUES (
    '58830000-0000-4000-8000-000000000206',
    1000000,
    '58830000-0000-4000-8000-000000000004',
    '2026-08-12 22:00:00',
    '2026-08-12 22:00:00',
    'IV.1',
    '6e986105-3df9-30de-8997-041d93537278',
    '6b23cb0a-a1c1-35f5-835e-dca1d009ae9b'
)
ON CONFLICT (id) DO UPDATE SET
    co2eq = EXCLUDED.co2eq,
    last_updated = EXCLUDED.last_updated,
    gpc_reference_number = EXCLUDED.gpc_reference_number,
    sector_id = EXCLUDED.sector_id,
    sub_sector_id = EXCLUDED.sub_sector_id;

INSERT INTO "HighImpactActionRanking" (
    id,
    locode,
    inventory_id,
    type,
    langs,
    status,
    created,
    last_updated,
    is_bulk,
    user_id
)
VALUES
    (
        '68830000-0000-4000-8000-000000000001',
        'US NYC',
        '58830000-0000-4000-8000-000000000004',
        'mitigation',
        ARRAY['en'],
        'SUCCESS',
        '2026-08-12 22:00:00',
        '2026-08-12 22:00:00',
        false,
        'f45bb51b-e532-49d9-a940-12d560292877'
    ),
    (
        '68830000-0000-4000-8000-000000000002',
        'US NYC',
        '58830000-0000-4000-8000-000000000004',
        'adaptation',
        ARRAY['en'],
        'SUCCESS',
        '2026-08-12 22:00:00',
        '2026-08-12 22:00:00',
        false,
        'f45bb51b-e532-49d9-a940-12d560292877'
    )
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    last_updated = EXCLUDED.last_updated,
    error_message = NULL;

INSERT INTO "HighImpactActionRanked" (
    id,
    hia_ranking_id,
    lang,
    type,
    name,
    hazards,
    sectors,
    primary_purposes,
    description,
    cost_investment_needed,
    timeline_for_implementation,
    is_selected,
    action_id,
    rank,
    explanation,
    created,
    last_updated
)
VALUES
    (
        '78830000-0000-4000-8000-000000000001',
        '68830000-0000-4000-8000-000000000001',
        'en',
        'mitigation',
        'Retrofit municipal buildings',
        ARRAY[]::text[],
        ARRAY['Stationary Energy'],
        ARRAY['Mitigation'],
        'Improve efficiency and electrify heating in municipal facilities.',
        'medium',
        '<5 years',
        true,
        'retrofit-municipal-buildings',
        1,
        '{"explanations":{"en":"Targets the inventory''s largest emitting sector."}}'::jsonb,
        '2026-08-12 22:00:00',
        '2026-08-12 22:00:00'
    ),
    (
        '78830000-0000-4000-8000-000000000002',
        '68830000-0000-4000-8000-000000000001',
        'en',
        'mitigation',
        'Electrify the municipal bus fleet',
        ARRAY[]::text[],
        ARRAY['Transportation'],
        ARRAY['Mitigation', 'Air quality'],
        'Replace diesel buses and add depot charging infrastructure.',
        'high',
        '5-10 years',
        true,
        'electrify-bus-fleet',
        2,
        '{"explanations":{"en":"Addresses transportation emissions and local air pollution."}}'::jsonb,
        '2026-08-12 22:00:00',
        '2026-08-12 22:00:00'
    ),
    (
        '78830000-0000-4000-8000-000000000003',
        '68830000-0000-4000-8000-000000000002',
        'en',
        'adaptation',
        'Expand the urban tree canopy',
        ARRAY['Extreme heat'],
        ARRAY[]::text[],
        ARRAY['Adaptation', 'Public health'],
        'Prioritize shade and cooling in heat-vulnerable neighborhoods.',
        'medium',
        '5-10 years',
        false,
        'expand-urban-tree-canopy',
        1,
        '{"explanations":{"en":"Provides cooling, health, and stormwater co-benefits."}}'::jsonb,
        '2026-08-12 22:00:00',
        '2026-08-12 22:00:00'
    ),
    (
        '78830000-0000-4000-8000-000000000004',
        '68830000-0000-4000-8000-000000000002',
        'en',
        'adaptation',
        'Upgrade stormwater infrastructure',
        ARRAY['Flooding', 'Heavy precipitation'],
        ARRAY[]::text[],
        ARRAY['Adaptation'],
        'Increase drainage capacity and introduce distributed green infrastructure.',
        'high',
        '>10 years',
        false,
        'upgrade-stormwater-infrastructure',
        2,
        '{"explanations":{"en":"Reduces flood exposure across vulnerable neighborhoods."}}'::jsonb,
        '2026-08-12 22:00:00',
        '2026-08-12 22:00:00'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    hazards = EXCLUDED.hazards,
    sectors = EXCLUDED.sectors,
    primary_purposes = EXCLUDED.primary_purposes,
    description = EXCLUDED.description,
    cost_investment_needed = EXCLUDED.cost_investment_needed,
    timeline_for_implementation = EXCLUDED.timeline_for_implementation,
    is_selected = EXCLUDED.is_selected,
    rank = EXCLUDED.rank,
    explanation = EXCLUDED.explanation,
    last_updated = EXCLUDED.last_updated;

COMMIT;
