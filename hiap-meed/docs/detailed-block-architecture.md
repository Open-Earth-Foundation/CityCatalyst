# Detailed block architecture

## Implementation status

| Block        | Sub-feature                                    | Status                                           |
| ------------ | ---------------------------------------------- | ------------------------------------------------ |
| Exclusion Preview | Sector, co-benefit, and guarded free-text proposal | Implemented |
| Hard Filter  | Confirmed exclusion by `action_id`             | Implemented                                      |
| Hard Filter  | Legal verdict check                            | Implemented                                      |
| Impact       | GPC reference evidence collection              | Implemented                                      |
| Impact       | Activity relevance x reduction band x timeline | Implemented                                      |
| Alignment    | Policy + sector + other components             | Implemented (`other` uses direct co-benefit selections plus normalized selected co-benefit scoring) |
| Feasibility  | Legal verdict score + mitigation feasibility + financial feasibility | Implemented                                      |
| Weighted Sum | Weighted aggregation, sort, rank, `top_n`      | Implemented                                      |

---

## Hard Filter Architecture

This block removes actions that are not eligible before any scoring happens. It applies two binary checks:

1. Confirmed city exclusions
2. Legal verdict screening (`blocked` actions are removed)

Biome filtering is intentionally not included yet.

### Inputs (and where they come from)

- **All mitigation actions**
  - Source: `Action` (core actions list)
- **Confirmed city exclusions**
  - Source: caller request `excludedActionIds[]`, usually confirmed after `POST /v1/prioritize/exclusions/preview`
  - Current behavior: each matching `action_id` is discarded before legal filtering
- **Legal assessment per action**
  - Source: legal assessments client payload (S3 by default, mock for fixtures), filtered by request `countryCode`

### Outputs

- **Filtered actions list**
  - Output: `Valid Actions for Scoring` (these proceed to Impact, Alignment, Feasibility)
- **Discarded actions**
  - Output: discarded due to exclusions or hard legal mismatch (useful for traceability and debugging)

```mermaid
graph TD
  ActionTbl[(Action)]
  Confirmed[(Frontend excludedActionIds)]
  LegalTbl[(ActionLegalAssessment<br/>country filtered)]

  Excl{Excluded by city?}
  Legal{Verdict category blocked?}

  DiscardExcl((Discarded<br/>Excluded))
  DiscardLegal((Discarded<br/>Legally blocked))
  Valid[Valid Actions for Scoring]

  ActionTbl --> Excl
  Confirmed -.-> Excl

  Excl -- Yes --> DiscardExcl
  Excl -- No --> Legal

  LegalTbl -.-> Legal

  Legal -- Yes --> DiscardLegal
  Legal -- No --> Valid
```

## Impact Architecture

Impact answers: **How much emissions reduction potential does this action have in this specific city?**

It combines:

- Activity relevance (city emissions in the activities the action targets)
- Reduction potential band (band converted to a multiplier)
- Timeline modifier (optional small boost for quicker wins)

### Inputs (and where they come from)

- City emissions, activity-level
  - Source: caller request `requestData.cityDataList[].cityEmissionsData.gpcData[*].activities[*].totalEmissions`
- Action to activity targeting (`gpc_ref` mapping)
  - Source: `Action.emissions`
- Reduction potential band
  - Source: `Action.emissions["impact_text"]` with configurable mapping (`very low` to `very high`)
- Timeline
  - Source: `Action.timelineForImplementation`
- Candidate actions (already hard-filtered)
  - Source: Hard Filter output: `Valid Actions for Scoring`

### Outputs

- Impact scores per action
  - Output: `Impact Scores` (one score per action, used in final ranking)
- Optional trace fields
  - Output: `Impact Evidence` (top contributing subsectors and multipliers)

Canonical score policy:

- Impact uses weighted-sum components in `0..1`.
- Canonical score formula:
  - `IMPACT_SCORE = (IMPACT_WEIGHT_REDUCTION_SHARE * reduction_component) + (IMPACT_WEIGHT_TIMELINE * timeline_component)`
- No run-relative max-normalization is applied.
- Negative `V.*` AFOLU inventory values remain valid input data, and Impact now scores AFOLU by absolute magnitude.
  - Subsector matching for Impact uses `abs(totalEmissions)` for AFOLU `V.*`.
  - The reduction denominator also includes `abs(totalEmissions)` for AFOLU `V.*`.
  - Non-AFOLU subsectors still require strictly positive city emissions.
  - This is intentional: AFOLU removals are not ignored, but negative non-AFOLU values still do not contribute to Impact scoring.
  - Net city emissions remain signed and can be negative; this denominator is a separate metric used only for ranking.
  - Conceptually, the denominator measures climate-relevant scoring magnitude, not signed net city emissions.

Current implementation detail:

- `impact_block_score = (0.80 x reduction_share_of_city_emissions) + (0.20 x timeline_score)`
- `reduction_share_of_city_emissions` is computed from matched action `sector.subsector` keys.

```mermaid
graph TD
  Valid[(Valid Actions for Scoring)]
  CityReq[(Frontend city emissions by GPC ref)]
  MitMap[(ActionMitigationImpact.emissions)]
  ActionTbl[(Action)]

  Rel[Activity relevance score]
  Band[Reduction band multiplier]
  Time[Timeline modifier]

  Combine[Impact Score]
  ImpactOut[Impact Scores]
  ImpactExplain[Impact Evidence optional]

  Valid --> Rel
  CityReq -.-> Rel
  MitMap -.-> Rel

  MitMap -.-> Band
  ActionTbl -.-> Time

  Rel --> Combine
  Band --> Combine
  Time --> Combine

  Combine --> ImpactOut
  Combine -.-> ImpactExplain
```

---

## Alignment Architecture

Alignment answers: **Does this action align with what the city and policy environment are trying to achieve?**

It combines:

- Action policy scores (supports, targets, funds, constrains)
- City strategic preferences (priority sectors, timeframe preferences, and political priorities)

Exclusions are handled in the Hard Filter stage, so Alignment only scores eligible actions.

### Inputs (and where they come from)

- Policy support score and signals
  - Source: `action_policy_scores_api_mock.json` (`policy_support_score`, `policy_evidence[]`)
- City strategic preference sectors
  - Source: caller request `cityStrategicPreferenceSectors`
- City strategic preference timeframes
  - Source: caller request `cityStrategicPreferenceTimeframes`
- Action implementation timeline
  - Source: `Action.timelineForImplementation`
- City strategic preference co-benefit keys
  - Source: caller request `cityStrategicPreferenceCoBenefitKeys`, validated against the allowed co-benefit taxonomy
- Action sector mapping for city preference overlap
  - Source: `Action.emissions["sector_number"]`
- Candidate actions (already hard-filtered)
  - Source: `Valid Actions for Scoring`

### Outputs

- Alignment scores per action
  - Output: `Alignment Scores` (one score per action, used in final ranking)
- Optional trace fields
  - Output: `Alignment Evidence` (component values, weights, contributions, sector diagnostics, timeframe diagnostics, policy summaries, resolved preferred co-benefits, unmappable fragments, matched preferred co-benefits, mapping source/model)

```mermaid
graph TD
  Valid[(Valid Actions for Scoring)]
  PolicyScore[(ActionPolicyScore)]
  Pref[(CityStrategicPreferences)]
  ActionTbl[(Action)]

  Policy[Policy alignment score]
  PrefBoost[Preference boost score]

  Combine[Alignment Score]
  AlignOut[Alignment Scores]
  AlignExplain[Alignment Evidence optional]

  Valid --> Policy
  PolicyScore -.-> Policy

  Valid --> PrefBoost
  Pref -.-> PrefBoost
  ActionTbl -.-> PrefBoost

  Policy --> Combine
  PrefBoost --> Combine

  Combine --> AlignOut
  Combine -.-> AlignExplain
```

---

## Feasibility Architecture

Feasibility answers: **Can this city realistically implement this action?**

It combines:

- Legal feasibility using the direct legal verdict score
- Mitigation feasibility from the city-scoped action feasibility endpoint
- Financial feasibility from the city-scoped climate-finance endpoint

Blocked legal verdicts are enforced in the Hard Filter stage.

### Inputs (and where they come from)

- Legal assessment rows by action
  - Source: `actions_legal_api_mock.json` filtered by `countryCode` and mapped by `srcActionId`
- Legal verdict score used in scoring
  - Source: `verdictScore`
- Legal evidence fields
  - Source: `ownership*`, `restrictions*`, `legalJustification*`, `legalReferences`, and timestamps
- Mitigation feasibility scores for the city
  - Source: `action_mitigation_feasibility_scores_api_mock.json` or the matching live endpoint, keyed by `src_action_id`
- Financial feasibility scores for the city
  - Source: `action_financial_feasibility_scores_api_mock.json` or `GET /api/v1/cities/{locode}/climate-finance/feasibility?country_code=...`, keyed by `action_id`
  - hiap-meed consumes the compact batch score, route, reason, and links; linked opportunity/project detail endpoints are not fetched in the first implementation
- Candidate actions (already hard-filtered)
  - Source: `Valid Actions for Scoring`

### Outputs

- Feasibility scores per action
  - Output: `Feasibility Scores` (one score per action, used in final ranking)
- Optional trace fields
  - Output: `Feasibility Evidence` (legal, mitigation, and financial component values; contribution weights; fallback diagnostics; compact route/reason/link evidence)

```mermaid
graph TD
  Valid[(Valid Actions for Scoring)]
  LegalRows[(Action legal assessments)]
  MitRows[(Action mitigation feasibility scores)]
  FinRows[(Action financial feasibility scores)]

  LegalSoft[Legal verdict component<br/>weight 0.34]
  MitFit[Mitigation feasibility component<br/>weight 0.33]
  FinFit[Financial feasibility component<br/>weight 0.33]

  Combine[Feasibility Score]
  FeasOut[Feasibility Scores]
  FeasExplain[Feasibility Evidence optional]

  Valid --> LegalSoft
  LegalRows -.-> LegalSoft

  Valid --> MitFit
  MitRows -.-> MitFit

  Valid --> FinFit
  FinRows -.-> FinFit

  LegalSoft --> Combine
  MitFit --> Combine
  FinFit --> Combine

  Combine --> FeasOut
  Combine -.-> FeasExplain
```

---

## Weighted Sum Architecture

This step combines the three pillar scores into a single ranking score and produces the prioritized list.

### Inputs (and where they come from)

- Impact scores
  - Source: Impact block output: `Impact Scores`
- Alignment scores
  - Source: Alignment block output: `Alignment Scores`
- Feasibility scores
  - Source: Feasibility block output: `Feasibility Scores`
- Weights
  - Source: configuration (recommended ranges: Impact 50 to 60 percent, Alignment 20 to 25 percent, Feasibility 20 to 30 percent)
- Candidate actions
  - Source: `Valid Actions for Scoring`

### Outputs

- Final prioritized action list
  - Output: `ranked_action_ids` plus `ranked_actions[]` payload items containing `rank`, pillar scores, final score, compact `evidence_summary`, and optional explanations keyed by language
  - Explanation shape: each requested language is generated independently from the fixed impact-driver, alignment-driver, and feasibility-driver structure; recurring labels come from `app/modules/prioritizer/translations.yaml`, while official names retain their source form
- Feasibility diagnostics artifact
  - Output: `012_feasibility.json` with the full grouped feasibility breakdown under `legal`, `mitigation_feasibility`, and `financial_feasibility`
  - API contrast: `ranked_actions[].evidence_summary.feasibility` uses the same grouped top-level component keys, but only includes the compact response subset plus `feasibility_score`

```mermaid
graph TD
  Valid[(Valid Actions for Scoring)]
  Impact[Impact Scores]
  Align[Alignment Scores]
  Feas[Feasibility Scores]
  Weights[(Weights)]

  Final[Final Score]
  Rank[Rank actions]
  Out[Final Prioritized Action List]

  Impact --> Final
  Align --> Final
  Feas --> Final
  Weights -.-> Final

  Final --> Rank
  Valid -.-> Rank

  Rank --> Out
```
