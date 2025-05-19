"""
This script optimizes the weights for the quantitative ranking system using the expert labeled data.

Run this script as a module to make sure sub imports are properly resolved.
>> python -m prioritizer.utils.weights_optimization (no .py extension)
"""

import pandas as pd
import numpy as np
from pathlib import Path
import torch
import torch.optim as optim
import json
from prioritizer.local_call import (
    quantitative_score,
    count_matching_hazards,
    calculate_emissions_reduction,
    find_highest_emission,
    scale_adaptation_effectiveness,
    timeline_mapping,
)


# Initialize weights as torch tensors
# Not a random initialization but initialized closer to optimal values
weights = {
    "GHGReductionPotential": torch.tensor(5.0, dtype=torch.float, requires_grad=True),
    "AdaptationEffectiveness": torch.tensor(1.0, dtype=torch.float, requires_grad=True),
    "TimelineForImplementation": torch.tensor(
        0.5, dtype=torch.float, requires_grad=True
    ),
    "CostInvestmentNeeded": torch.tensor(0.5, dtype=torch.float, requires_grad=True),
    "Hazard": torch.tensor(2.5, dtype=torch.float, requires_grad=True),
    "Dependencies": torch.tensor(0.1, dtype=torch.float, requires_grad=True),
}


def load_data_from_folder(folder_path):
    """
    Reads all JSON files in the specified folder and returns a combined pandas DataFrame.
    Assumes each JSON file contains a list of comparison dictionaries.
    """
    all_data = []
    json_files = list(folder_path.glob("*.json"))
    if not json_files:
        print(f"No JSON files found in {folder_path}. Please check the folder path.")
        return pd.DataFrame()

    for file in json_files:
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
                # If the JSON file contains a list of dictionaries, extend the list.
                if isinstance(data, list):
                    all_data.extend(data)
                else:
                    print(f"Unrecognized data format in file: {file}")
        except Exception as e:
            print(f"Error reading {file}: {e}")

    df = pd.DataFrame(all_data)
    return df


def remove_irrelevant_rows(df, remove_unsure: bool) -> pd.DataFrame:
    """
    Removes rows where the 'PreferredAction' is 'Irrelevant'.
    If remove_unsure is True, also removes rows where the 'PreferredAction' is 'Unsure'.
    """

    df_cleaned = df[df["PreferredAction"] != "Irrelevant"]
    if remove_unsure:
        df_cleaned = df_cleaned[df_cleaned["PreferredAction"] != "Unsure"]

    return df_cleaned


def get_action_by_id(actions, target_action_id):
    """
    Returns the action dictionary with the specified ActionID from the list of actions.
    """

    for action in actions:
        if action.get("ActionID") == target_action_id:
            return action
    return None


# The following function is the modified version of the original quantitative_score function from prioritizer.py.
# It uses torch tensors for calculations and the provided weights as input.
def quantitative_score_torch(city, action, weights):
    """
    Calculates a quantitative score for a given action in a city using PyTorch tensors.
    The weights argument is expected to be a dictionary where each key corresponds to a
    weight tensor with `requires_grad=True` for optimization.
    """
    # Initialize score as a tensor
    score = torch.tensor(0.0, dtype=torch.float, requires_grad=True)

    # 1. Hazard calculation
    matching_hazards_count = count_matching_hazards(city, action)  # returns an integer
    if matching_hazards_count > 0:
        hazards_weight = weights["Hazard"]
        score = (
            score
            + torch.tensor(matching_hazards_count, dtype=torch.float) * hazards_weight
        )

    # 2. Dependencies (negative impact)
    dependencies = action.get("Dependencies", [])
    dependencies_weight = weights["Dependencies"]
    if isinstance(dependencies, list):
        score = (
            score
            - torch.tensor(len(dependencies), dtype=torch.float) * dependencies_weight
        )

    # 3. Emissions reduction score
    total_emission_reduction_all_sectors = calculate_emissions_reduction(city, action)
    weights_emissions = weights["GHGReductionPotential"]

    if total_emission_reduction_all_sectors > 0:
        total_emissions = city.get("totalEmissions", 1)  # Avoid division by zero
        reduction_percentage = total_emission_reduction_all_sectors / total_emissions
        score = (
            score
            + torch.tensor(reduction_percentage, dtype=torch.float) * weights_emissions
        )

    # 4. Sector bonus for highest emissions sector
    most_emissions, percentage_emissions_value = find_highest_emission(city)
    if action.get("Sector") == most_emissions:
        bonus = torch.tensor(percentage_emissions_value / 100, dtype=torch.float)
        score = score + bonus * weights_emissions

    # 5. Adaptation effectiveness score
    adaptation_effectiveness = action.get("AdaptationEffectiveness")
    if adaptation_effectiveness in scale_adaptation_effectiveness:
        effective_value = scale_adaptation_effectiveness[adaptation_effectiveness]
        if effective_value:  # Skip zero values
            adaptation_weight = weights["AdaptationEffectiveness"]
            score = (
                score
                + torch.tensor(effective_value, dtype=torch.float) * adaptation_weight
            )

    # 6. Timeline for implementation
    timeline_str = action.get("TimelineForImplementation", "")
    if timeline_str and timeline_str in timeline_mapping:
        time_score_weight = weights["TimelineForImplementation"]
        time_score = timeline_mapping[timeline_str]
        score = score + torch.tensor(time_score, dtype=torch.float) * time_score_weight

    # 7. Cost score
    if "CostInvestmentNeeded" in action:
        cost_investment_needed = action["CostInvestmentNeeded"]
        cost_score_weight = weights["CostInvestmentNeeded"]
        cost_score = scale_adaptation_effectiveness.get(cost_investment_needed, 0)
        score = score + torch.tensor(cost_score, dtype=torch.float) * cost_score_weight

    return score


# Define the hinge loss function.
def hinge_loss(score_diff, y, margin=1.0):
    """
    Computes the hinge loss for a single pair.

    Args:
        score_diff (float): The difference in scores (score(actionA) - score(actionB)).
        y (int): expert label, +1 if actionA is preferred, -1 if actionB is preferred.
        margin (float): The margin parameter that specifies the minimum desired score difference.

    Returns:
        float: The hinge loss value.
    """
    return max(0, margin - y * score_diff)


# Define the hinge loss function in PyTorch.
def hinge_loss_torch(score_diff, y, margin=1.0):
    """
    Computes the hinge loss for a single pair using PyTorch tensors.

    Args:
        score_diff (torch.Tensor): The difference in scores (score(actionA) - score(actionB)).
        y (float): expert label, +1 if actionA is preferred, -1 if actionB is preferred.
        margin (float): The margin parameter that specifies the minimum desired score difference.

    Returns:
        torch.Tensor: The hinge loss value.
    """
    return torch.clamp(margin - y * score_diff, min=0)


# This is an optional function to compute the hinge loss for each pair of actions.
def compute_loss():

    skipped = []
    losses = []
    for _, row in df_all_comparisons_cleaned.iterrows():
        """
        negative score_diff means actionA is preferred according to the model
        positive score_diff means actionB is preferred according to the model

        y=+1 if actionA is preferred.
        y=-1 if actionB is preferred.
        """

        # Read the city data for the comparison
        city_data = read_city_inventory(row["CityLocode"])
        actionA = row["ActionA"]
        actionB = row["ActionB"]

        # Get the actual actions object from the actionsID
        actionA_with_context = get_action_by_id(actions, actionA)
        actionB_with_context = get_action_by_id(actions, actionB)

        # Check if both actions were found
        # Experts may have ranked actions that were removed from our side due to duplicates etc.
        if actionA_with_context and actionB_with_context:

            scoreA = quantitative_score(city_data, actionA_with_context)
            scoreB = quantitative_score(city_data, actionB_with_context)

            score_diff = scoreA - scoreB
            y_actionID = row["PreferredAction"]

            # Assign +1 if actionA is preferred, -1 if actionB is preferred
            y = 1 if y_actionID == actionA else -1

            loss = hinge_loss(score_diff, y, margin=1.0)
            losses.append(loss)
            # print(f"Pair {index}:")
            # print(f"  actionA = {actionA}")
            # print(f"  actionB = {actionB}")
            # print(f"  scoreA = {scoreA:.2f}")
            # print(f"  scoreB = {scoreB:.2f}")
            # print(f"  score_diff = {score_diff:.2f}")
            # print(f"  preferred action = {y_actionID}")
            # print(f"  preferred action label = {y}")
            # print(f"  hinge loss = {loss:.2f}\n")

        else:
            # Add the missing action to the skipped list to keep track of them
            if actionA_with_context is None:
                skipped.append(actionA)
            elif actionB_with_context is None:
                skipped.append(actionB)
            else:
                skipped.append(actionA)
                skipped.append(actionB)

            print("Action not found. Probably removed from the action data.")
            print("Skipping this comparison")

    print(f"\nSkipped {len(skipped)} comparisons due to missing actions.")
    print(f"Skipped actions: {set(skipped)}")

    total_loss = np.sum(losses)
    print("Total hinge loss:", total_loss)


def optimize_weights(num_epochs, optimizer, weights, m):

    num_epochs = num_epochs
    for epoch in range(num_epochs):
        total_loss = torch.tensor(0.0, dtype=torch.float)
        optimizer.zero_grad()  # Reset gradients at the start of each epoch

        skipped = []
        # Iterate over each pair
        for _, row in df_all_comparisons_cleaned.iterrows():
            # Retrieve city data and actions based on your current code.
            city_data = read_city_inventory(row["CityLocode"])
            actionA = row["ActionA"]
            actionB = row["ActionB"]

            actionA_with_context = get_action_by_id(actions, actionA)
            actionB_with_context = get_action_by_id(actions, actionB)

            # Check if both actions were found
            # Experts may have ranked actions that were removed from our side due to duplicates etc.
            if actionA_with_context and actionB_with_context:

                # Compute scores using the torch-enabled scoring function.
                score_A = quantitative_score_torch(
                    city_data, actionA_with_context, weights
                )
                score_B = quantitative_score_torch(
                    city_data, actionB_with_context, weights
                )
                score_diff = score_A - score_B

                # Map the PreferredAction label to +1 (if actionA is preferred) or -1 (if actionB is preferred).
                y = 1.0 if row["PreferredAction"] == actionA else -1.0

                loss = hinge_loss_torch(score_diff, y, margin=m)
                total_loss = total_loss + loss
            else:
                # Add the missing action to the skipped list to keep track of them
                if actionA_with_context is None:
                    skipped.append(actionA)
                elif actionB_with_context is None:
                    skipped.append(actionB)
                else:
                    skipped.append(actionA)
                    skipped.append(actionB)

                # print("Action not found. Probably removed from the action data.")
                # print("Skipping this comparison")

        print(
            f"\nSkipped {len(skipped)} comparisons due to missing actions for this training epoch."
        )
        print(f"Skipped actions: {set(skipped)}")

        # Backpropagate total loss and update weights.
        total_loss.backward()
        optimizer.step()

        print(f"Epoch {epoch+1:3d}: Total Hinge Loss = {total_loss.item():.4f}")

    print("Optimized weights:")
    for key, weight in weights.items():
        print(f"  {key}: {weight.item():.4f}")


if __name__ == "__main__":

    # Define the folder path where the expert labeled actions are stored
    folder_path = (
        Path(__file__).parent.parent.parent / "data" / "expert_labeled_actions"
    )

    # Load all comparison data from the folder
    df_all_comparisons = load_data_from_folder(folder_path)

    # print(df_all_comparisons.head())
    # print(len(df_all_comparisons))

    df_all_comparisons_cleaned = remove_irrelevant_rows(
        df_all_comparisons, remove_unsure=True
    )

    # print(df_all_comparisons_cleaned.head())
    # print(len(df_all_comparisons_cleaned))

    actions = read_actions()

    # Compute the hinge loss piror to optimization
    # compute_loss()

    # Create an optimizer over the weight parameters.
    # To optimize weights in a dictionary, we pass a list of their values.
    optimizer = optim.Adam(list(weights.values()), lr=0.1)

    # Run the optimization process
    optimize_weights(150, optimizer, weights, m=1.2)
