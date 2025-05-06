from pathlib import Path
import argparse
import json
from utils.llm_creator import generate_response
from jsonschema import validate, ValidationError


def main(input: str, is_mitigation: bool, is_adaptation: bool):
    # print(input, is_mitigation, is_adaptation)

    # Constant schema path and base folder for output files
    SCHEMA_PATH = Path("../schema/generic_action_schema.json")

    generic_action_schema = json.load(open(SCHEMA_PATH))
    # print(generic_action_schema)

    if is_mitigation and not is_adaptation:
        prompt = f"""
Your task is to extract mitigation actions from a given text and to return a JSON file according to a specific JSON schema.
Try to derive the required information from the input string as good as possible.
If there is no information in the input string for a certain field and you cannot derive it with high confidence, set the respective value to 'null' according to the JSON schema.

<input>
The input text is as follows:
{input}
</input>

<schema>
The JSON schema cotains the following fields:
- ActionID
- ActionName
- ActionType
- AdaptationCategory
- Hazard
- Sector
- Subsector
- PrimaryPurpose
- InterventionType
- Description
- BehavioralChangeTargeted
- CoBenefits
- EquityAndInclusionConsiderations
- GHGReductionPotential
- AdaptationEffectiveness
- CostInvestmentNeeded
- TimelineForImplementation
- Dependencies
- KeyPerformanceIndicators
- Impacts

This is JSON schema:
{json.dumps(generic_action_schema, indent=4)}
</schema>

For mitigation actions extract only information for the following fields:
- ActionName
- ActionType
- Sector
- Subsector
- PrimaryPurpose
- InterventionType
- Description
- BehavioralChangeTargeted
- CoBenefits
- EquityAndInclusionConsiderations
- GHGReductionPotential
- CostInvestmentNeeded
- TimelineForImplementation
- Dependencies
- KeyPerformanceIndicators
- Impacts

All fields not listed above must be included in the output JSON file as well but the respective values must be set to 'null' according to the JSON schema.

Return only a valid JSON file according to the schema without any further syntax like ```json ``` or similar.
"""
    elif is_adaptation and not is_mitigation:
        prompt = f"""
Your task is to extract adaptation actions from a given text and to return a JSON file according to a specific JSON schema.
Try to derive the required information from the input string as good as possible.
If there is no information in the input string for a certain field and you cannot derive it with high confidence, set the respective value to 'null' according to the JSON schema.

<input>
The input text is as follows:
{input}
</input>

<schema>
The JSON schema cotains the following fields:
- ActionID
- ActionName
- ActionType
- AdaptationCategory
- Hazard
- Sector
- Subsector
- PrimaryPurpose
- InterventionType
- Description
- BehavioralChangeTargeted
- CoBenefits
- EquityAndInclusionConsiderations
- GHGReductionPotential
- AdaptationEffectiveness
- CostInvestmentNeeded
- TimelineForImplementation
- Dependencies
- KeyPerformanceIndicators
- Impacts

This is JSON schema:
{json.dumps(generic_action_schema, indent=4)}
</schema>

For adaptation actions extract only information for the following fields:
- ActionName
- ActionType
- AdaptationCategory
- Hazard
- Sector
- PrimaryPurpose
- Description
- CoBenefits
- EquityAndInclusionConsiderations
- AdaptationEffectiveness
- CostInvestmentNeeded
- TimelineForImplementation
- Dependencies
- KeyPerformanceIndicators
- Impacts

All fields not listed above must be included in the output JSON file as well but the respective values must be set to 'null' according to the JSON schema.

Return only a valid JSON file according to the schema without any further syntax like ```json ``` or similar.
"""
    elif is_mitigation and is_adaptation:
        prompt = f"""
Your task is to extract mitigation and adaptation actions from a given text and to return a JSON file according to a specific JSON schema.
Try to derive the required information from the input string as good as possible.
If there is no information in the input string for a certain field and you cannot derive it with high confidence, set the respective value to 'null' according to the JSON schema.

<input>
The input text is as follows:
{input}
</input>

<schema>
The JSON schema cotains the following fields:
- ActionID
- ActionName
- ActionType
- AdaptationCategory
- Hazard
- Sector
- Subsector
- PrimaryPurpose
- InterventionType
- Description
- BehavioralChangeTargeted
- CoBenefits
- EquityAndInclusionConsiderations
- GHGReductionPotential
- AdaptationEffectiveness
- CostInvestmentNeeded
- TimelineForImplementation
- Dependencies
- KeyPerformanceIndicators
- Impacts

This is JSON schema:
{json.dumps(generic_action_schema, indent=4)}
</schema>

For mitigation and adaptation actions extract only information for the following fields:
- ActionName
- ActionType
- AdaptationCategory
- Hazard
- Sector
- Subsector
- PrimaryPurpose
- InterventionType
- Description
- BehavioralChangeTargeted
- CoBenefits
- EquityAndInclusionConsiderations
- GHGReductionPotential
- AdaptationEffectiveness
- CostInvestmentNeeded
- TimelineForImplementation
- Dependencies
- KeyPerformanceIndicators
- Impacts

All fields not listed above must be included in the output JSON file as well but the respective values must be set to 'null' according to the JSON schema.

Return only a valid JSON file according to the schema without any further syntax like ```json ``` or similar.
"""
    else:
        prompt = "ERROR: Please specify whether to extract mitigation and/or adaptation actions."

    response = generate_response(prompt)

    i: int = 0
    error: bool = True

    # Simulate error here
    if response:
        response += "Add a faulty string here"

    while error and i < 3:
        if response:
            print(f"Validation attempt {i + 1}:")

            # Validate the output JSON file
            try:
                output = json.loads(response)
                # # Simulate an error
                # output["Dependencies"] = "This is a string and not a list of strings"
                validate(instance=output, schema=generic_action_schema)
                error = False
                print("JSON successfully validated.")
            except ValidationError as e:
                print(f"Validation error: {e.message}")
                print(f"Error inside field: {' -> '.join(map(str, e.path))}")
                i += 1
                error = True

                error_prompt = f"""
<error_message>
The JSON file you provided is invalid.
This is the error message:
{e.message}

Return only a valid JSON file according to the schema without any further syntax like ```json ``` or similar.
</error_message>
"""

                # Make new LLM call
                response = generate_response(prompt)
            except json.JSONDecodeError as e:
                print(f"Invalid JSON: {e.msg}")
                i += 1
                error = True
                # Make new LLM call
                error_prompt = f"""
<error_message>
The JSON file you provided is invalid. 
This is the error message:
{e.msg}

Return only a valid JSON file according to the schema without any further syntax like ```json ``` or similar.
</error_message>
"""

                response = generate_response(prompt + error_prompt)

        else:
            print("No response from LLM.")

    return response


if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description="Extract mitigation and/or adaptation actions from a a string of text using an LLM."
    )
    parser.add_argument("--input", type=str, required=True, help="Input text")
    parser.add_argument(
        "--mitigation",
        action="store_true",
        help="Flag to indicate whether to extract mitigation actions",
    )

    parser.add_argument(
        "--adaptation",
        action="store_true",
        help="Flag to indicate whether to extract adaptation actions",
    )

    args = parser.parse_args()

    response = main(args.input, args.mitigation, args.adaptation)
    print("This is the final response: \n\n")
    print(response)
