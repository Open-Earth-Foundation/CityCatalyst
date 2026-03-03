# High-Level Prioritization Architecture

This diagram illustrates the top-level data flow. A Hard Filter Gate prunes ineligible actions before the remaining valid actions enter the ranking stage and are scored across the three pillars.

```mermaid
graph TD
  CityData[(City Data)]
  ActionData[(Action Data)]

  HardFilter[Hard Filter Gate]
  Discard((Discarded Actions))
  Valid[Valid Actions for Scoring]

  Impact[Impact]
  Alignment[Alignment]
  Feasibility[Feasibility]

  WeightedSum[Weighted Sum]
  FinalList((Final Prioritized Action List))

  CityData --> HardFilter
  ActionData --> HardFilter

  HardFilter -- fails --> Discard
  HardFilter -- passes --> Valid

  Valid --> Impact
  Valid --> Alignment
  Valid --> Feasibility

  Impact --> WeightedSum
  Alignment --> WeightedSum
  Feasibility --> WeightedSum

  WeightedSum --> FinalList
```
