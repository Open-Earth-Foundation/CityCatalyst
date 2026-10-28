# Global Warming Potential (GWP) seed data

Source: [GHG Protocol Global Warming Potential Values](https://ghgprotocol.org/sites/default/files/2024-08/Global-Warming-Potential-Values%20%28August%202024%29.pdf)
(AR5 columns from the Feb 2016 GHG Protocol sheet historically used by CityCatalyst;
AR6 GWP100 from the same GHG Protocol publication / IPCC AR6).

- `gwp_version`: `ar5` or `ar6` (matches `Inventory.globalWarmingPotentialType`)
- Gas identifiers use chemical formulas (e.g. `CCl3F` = CFC-11) as stored in activities
- CH4 AR6 uses 27.9 (non-fossil / headline AR6GWP100 used in GHG Protocol tables)
