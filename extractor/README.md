# Extractor

This module takes as input a list of climate actions from C40. It extracts values from this list into a generic_action_schema for downstream processing.

Attribute Types

1. Directly extracted attributes (generated: false) \
   These attributes are expected to be filled inside the input list. They can be directly extracted using simple 1:1 mappings are simple logic.

   Attributes:

   - ActionName: Descriptive name of the action
   - ActionType: Specifies whether the action is a Mitigation or Adaptation action
   - AdaptationCategory: Specifies the category of adaptation action
   - Hazard: The hazard the adaptation action is aligned with
   - Sector: The sector to which the action belongs
   - Subsector: The subsector the mitigation action is aligned with
   - PrimaryPurpose: The main goal of the action, e.g., GHG Reduction, Climate Resilience
   - Description: Detailed description of the action
   - CoBenefits: Additional benefits beyond the primary objective
   - GHGReductionPotential: Potential for GHG reduction in specific sectors
   - CostInvestmentNeeded: The financial viability of the action
   - TimelineForImplementation: Estimated time required to fully implement the action

2. Generated attributes (generated: true) \
   These attributes are cannot be direectly extracted from the input list because they are either not given, or need to be combined with other information. Those will be generated based on available information and therefore might be less accurate.

   Attributes:

   - ActionID: Unique identifier for each action
   - InterventionType: Specifies the intervention category enabling the activity shift for mitigation actions
   - BehaviouralChangeTargeted: Describes the behavioral change encouraged by the intervention
   - EquityAndInclusionConsiderations: How the action promotes equity and inclusion, focusing on vulnerable or underserved communities
   - AdaptationEffectiveness: The effectiveness of the adaptation action to climate risks
   - Dependencies: Dependencies or prerequisites for the action to succeed
   - KeyPerformanceIndicators: Metrics to measure the success of the action
   - Impacts: Broader impacts, such as increased urban livability or improved public health

## Usage

`python main.py --input-file <filename>` runs the script. \
It will load the file passed in as an argument from the folder `/data` and output a file in `extractor/output` folder adhering to the schema inside `/schema` folder

The arguments are:

--input-file -> The C40 actions list \
--parse-rows -> (optional) if set, only the top x rows will be processed for testing \
