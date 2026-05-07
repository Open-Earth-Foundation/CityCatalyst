# Scoring Weights Overview

This diagram summarizes the scoring weights currently implemented in the `hiap-meed` prioritization pipeline.

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 38, "rankSpacing": 48, "curve": "basis"}, "themeVariables": {"lineColor": "#7a7a7a"}} }%%
flowchart TD
    FS["Final Score"]
    FS -->|0.55| IMP["Impact Pillar"]
    FS -->|0.22| ALN["Alignment Pillar"]
    FS -->|0.23| FEA["Feasibility Pillar"]

    IMP -->|0.80| IMP_RED["Emissions Reduction Share of City Total"]
    IMP -->|0.20| IMP_TIME["Timeline Component"]

    IMP_TIME -->|1.0| IMP_T_SHORT["<5 years"]
    IMP_TIME -->|0.5| IMP_T_MED["5-10 years"]
    IMP_TIME -->|0.0| IMP_T_LONG[">10 years"]
    IMP_TIME -->|0.5| IMP_T_UNKNOWN["Missing / Unknown timeline"]

    IMP_RED --> IMP_BAND["Impact Text Multiplier"]
    IMP_BAND -->|0.2| BAND_VLOW["very low"]
    IMP_BAND -->|0.4| BAND_LOW["low"]
    IMP_BAND -->|0.6| BAND_MED["medium"]
    IMP_BAND -->|0.8| BAND_HIGH["high"]
    IMP_BAND -->|1.0| BAND_VHIGH["very high"]

    ALN -->|0.75| ALN_POL["Policy Component"]
    ALN -->|0.15| ALN_SEC["Sector Match Component"]
    ALN -->|0.05| ALN_COB["Co-benefit Preference Component"]
    ALN -->|0.05| ALN_TIME["Timeframe Preference Component"]

    ALN_POL -->|direct 0..1 input| POL_SCORE["policy_support_score"]
    POL_SCORE -->|fallback 0.0| POL_MISS["Missing policy score"]

    ALN_SEC -->|1.0| SEC_MATCH["Sector overlap with city preference"]
    ALN_SEC -->|0.0| SEC_NO["No sector overlap"]

    ALN_COB -->|normalize from -2..2 to 0..1| COB_NORM["Selected co-benefit impacts"]
    COB_NORM -->|0.0| COB_HARM["Most harmful aggregate"]
    COB_NORM -->|0.5| COB_NEUT["Neutral aggregate"]
    COB_NORM -->|1.0| COB_POS["Most beneficial aggregate"]
    ALN_COB -->|0.5| COB_NONE["No co-benefits selected"]

    ALN_TIME -->|1.0| ALN_TIME_EXACT["Exact timeframe match"]
    ALN_TIME -->|0.5| ALN_TIME_ADJ["Adjacent match"]
    ALN_TIME -->|0.0| ALN_TIME_FAR["Far mismatch"]
    ALN_TIME -->|0.5| ALN_TIME_NOPREF["no_preference / no supported preference"]
    ALN_TIME -->|0.5| ALN_TIME_UNKNOWN["Missing / Unknown action timeline"]

    FEA -->|0.50| FEA_LEG["Soft Legal Component"]
    FEA -->|0.50| FEA_SOC["Socioeconomic Component"]

    FEA_LEG -->|aligned_soft / total_soft| LEG_RATIO["Recommended + Optional requirements only"]
    LEG_RATIO -->|0.0 fallback| LEG_NONE["No soft legal requirements"]

    FEA_SOC -->|normalize from -2..2 to 0..1| SOC_NORM["Weighted socioeconomic average"]
    SOC_NORM -->|bucket -2| SOC_VLOW["very_low"]
    SOC_NORM -->|bucket -1| SOC_LOW["low"]
    SOC_NORM -->|bucket 0| SOC_MED["medium"]
    SOC_NORM -->|bucket 1| SOC_HIGH["high"]
    SOC_NORM -->|bucket 2| SOC_VHIGH["very_high"]
    FEA_SOC -->|missing city indicator -> raw 0| SOC_MISS["Missing city indicator contributes 0 before normalization"]
    FEA_SOC -->|0.5 fallback| SOC_NONE["No socioeconomic rules on action"]

    linkStyle 0,1,2 stroke-width:4px
    linkStyle 3,4,16,17 stroke-width:3px
    linkStyle 18,19,20,21,27,28 stroke-width:2.5px
```

## Notes

- `0.5` is not universally neutral across all components.
- `0.5` is a true neutral midpoint only for components normalized from a signed scale such as `-2..2`.
- Timeline is scored differently in Impact and Alignment:
  - Impact uses intrinsic speed scoring.
  - Alignment uses match-to-city-preference scoring.
