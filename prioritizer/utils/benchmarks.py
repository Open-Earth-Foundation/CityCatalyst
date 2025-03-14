"""
This script benchmarks the quantitative (linear) and qualitative ranking system against the expert labeled data.

Run this script as a module to make sure sub imports are properly resolved.
>> python -m prioritizer.utils.benchmarks
"""

import pandas as pd
from pathlib import Path
import json
import concurrent.futures
from prioritizer.prioritizer import quantitative_score, qualitative_score
from prioritizer.utils.reading_writing_data import read_city_inventory, read_actions
from prioritizer.utils.ml_comparator import ml_compare
import numpy as np
from typing import Tuple
import scipy.stats as stats


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


# Initialize contingency table counts
contingency_table = {
    "C_C": 0,  # Both correct
    "C_W": 0,  # Quanti correct, ML wrong
    "W_C": 0,  # Quanti wrong, ML correct
    "W_W": 0,  # Both wrong
}


def update_contingency_table(
    predicted_label_quanti: str, predicted_label_ml: str, preferred_action: str
) -> None:
    # Categorize errors into the contingency table
    quanti_correct = predicted_label_quanti == preferred_action
    ml_correct = predicted_label_ml == preferred_action

    if quanti_correct and ml_correct:
        contingency_table["C_C"] += 1
    elif quanti_correct and not ml_correct:
        contingency_table["C_W"] += 1
    elif not quanti_correct and ml_correct:
        contingency_table["W_C"] += 1
    else:
        contingency_table["W_W"] += 1


def get_chi2_test_results() -> None:

    contingency_df = pd.DataFrame.from_dict(
        contingency_table, orient="index", columns=["Count"]
    )
    print(contingency_df)

    # Perform Chi-Square Test dynamically
    observed = [
        [contingency_table["C_C"], contingency_table["C_W"]],
        [contingency_table["W_C"], contingency_table["W_W"]],
    ]

    chi2, p, dof, expected = stats.chi2_contingency(observed)

    # Display results
    print(f"Chi-Square Statistic: {chi2}")
    print(f"P-value: {p}")
    print(f"Degrees of Freedom: {dof}")
    print("Expected Frequencies:")
    print(expected)


def get_accuracy_expert_vs_comparators(
    df: pd.DataFrame, actions: list
) -> Tuple[float, float, float, float, float]:

    skipped_missing_actions = []
    skipped_errors = []
    score_quanti = 0
    score_quali = 0
    score_ml = 0
    score_consensus = 0
    score_majority = 0
    valid_comparisons = 0

    error_quanti = []  # List to store quantitative model errors
    error_ml = []  # List to store ML model errors

    for _, row in df.iterrows():

        def get_quantitative_label(
            city_data, actionA_with_context, actionB_with_context
        ) -> str:
            score_A = quantitative_score(city_data, actionA_with_context)
            score_B = quantitative_score(city_data, actionB_with_context)
            return actionA if score_A > score_B else actionB

        def get_qualitative_label(
            city_data, actionA_with_context, actionB_with_context
        ) -> str:
            quali_score = qualitative_score(
                city_data, [actionA_with_context, actionB_with_context]
            )
            if quali_score:
                winner = quali_score.actions[0].action_id
                predicted_label_quali = actionA if winner == actionA else actionB

                return predicted_label_quali
            else:
                raise ValueError("Qualitative score not found.")

        def get_ml_label(city_data, actionA_with_context, actionB_with_context) -> str:
            predicted_action = ml_compare(
                city_data, actionA_with_context, actionB_with_context
            )

            return actionA if predicted_action == 1 else actionB

        # Read the city data for the comparison
        city_data = read_city_inventory(row["CityLocode"])
        locode = row["CityLocode"]
        actionA = row["ActionA"]
        actionB = row["ActionB"]
        preferred_action = row["PreferredAction"]

        # print(f"\nCity: {row['CityLocode']}")
        # print(f"Action A: {actionA}")
        # print(f"Action B: {actionB}")
        # print(f"Preferred action: {preferred_action}")

        # Get the actual actions object from the actionsID (filling in the context)
        actionA_with_context = get_action_by_id(actions, actionA)
        actionB_with_context = get_action_by_id(actions, actionB)

        # Check if both actions were found
        # E.g. if comparisons were made from experts on actions that were later deleted
        if actionA_with_context and actionB_with_context:
            try:

                ### Quantitative
                predicted_label_quanti = get_quantitative_label(
                    city_data, actionA_with_context, actionB_with_context
                )
                print(f"Predicted label quanti: {predicted_label_quanti}")

                ### QUALITATIVE
                # predicted_label_quali = get_qualitative_label(
                #     city_data, actionA_with_context, actionB_with_context
                # )
                # print(f"Predicted label quali: {predicted_label_quali}")

                ### ML

                predicted_label_ml = get_ml_label(
                    city_data, actionA_with_context, actionB_with_context
                )
                print(f"Predicted label ML: {predicted_label_ml}")

                # # ### Consensus

                # # If winner_quant and ml_winner agree, return their decision
                # if predicted_label_quanti == predicted_label_ml:
                #     predicted_label_consensus = predicted_label_quanti

                # else:
                #     predicted_label_consensus = predicted_label_quali

                # print(f"Predicted label consensus: {predicted_label_consensus}")

                # ### Majority vote

                # votes = [
                #     predicted_label_quali,
                #     predicted_label_quanti,
                #     predicted_label_ml,
                # ]

                # if votes.count(actionA) >= 2:
                #     predicted_label_majority = actionA
                # else:
                #     predicted_label_majority = actionB

                # print(f"Predicted label majority: {predicted_label_majority}")

                # Convert predictions into binary error vectors
                # Record errors (1 = wrong, 0 = correct)
                error_quanti.append(
                    1 if row["PreferredAction"] != predicted_label_quanti else 0
                )
                error_ml.append(
                    1 if row["PreferredAction"] != predicted_label_ml else 0
                )

                # Update contingency table for chi-square test
                update_contingency_table(
                    predicted_label_quanti, predicted_label_ml, preferred_action
                )

                ### Add up scores
                # If prediction is correct, add 1 to the score
                if predicted_label_quanti == preferred_action:
                    score_quanti += 1

                # if predicted_label_quali == preferred_action:
                #     score_quali += 1

                # If prediction is correct, add 1 to the score
                if predicted_label_ml == preferred_action:
                    score_ml += 1

                # if predicted_label_consensus == preferred_action:
                #     score_consensus += 1

                # if predicted_label_majority == preferred_action:
                #     score_majority += 1

                # Count this as a valid comparison
                valid_comparisons += 1

                # print("score_quanti", score_quanti)
                # print("score_quali", score_quali)
                # print("score_ml", score_ml)
                # print("score_consensus", score_consensus)
                # print("score_majority", score_majority)
                # print("valid_comparisons", valid_comparisons)

            except ValueError as e:
                print(f"Skipping comparison due to error: {e}")
                skipped_errors.append((locode, actionA, actionB))
        else:
            # Add the missing action to the skipped list to keep track of them
            print("Skipping comparison due to missing actions.")
            if actionA_with_context is None:
                skipped_missing_actions.append(actionA)
            elif actionB_with_context is None:
                skipped_missing_actions.append(actionB)
            else:
                skipped_missing_actions.append(actionA)
                skipped_missing_actions.append(actionB)

            continue

    # Make chi-square test and print results
    get_chi2_test_results()

    # Convert lists to numpy arrays
    error_quanti = np.array(error_quanti)
    error_ml = np.array(error_ml)

    # Check if there's enough data for correlation
    if len(error_quanti) > 1 and len(error_ml) > 1:
        correlation = np.corrcoef(error_quanti, error_ml)[0, 1]
        print(f"Pearson Correlation of Errors: {correlation}")
    else:
        print("Not enough data points to compute correlation.")

    print(
        f"\nSkipped {len(skipped_missing_actions)} comparisons due to missing actions."
    )
    print(f"Skipped actions: {set(skipped_missing_actions)}")

    print(
        f"\nSkipped {len(skipped_errors)} comparisons due to errors, e.g. missing data."
    )
    print(f"Skipped actions: {set(skipped_errors)}")

    print(f"Valid comparisons: {valid_comparisons}")

    # Calculate accuracy
    accuracy_quanti = score_quanti / valid_comparisons
    accuracy_quali = score_quali / valid_comparisons
    accuracy_ml = score_ml / valid_comparisons
    accuracy_consensus = score_consensus / valid_comparisons
    accuracy_majority = score_majority / valid_comparisons
    return (
        accuracy_quanti,
        accuracy_quali,
        accuracy_ml,
        accuracy_consensus,
        accuracy_majority,
    )


# def process_row_quali(index, row, actions):
#     """Helper function for parallelized qualitative accuracy computation."""

#     print(f"Processing row {index}")
#     print("City locode: ", row["CityLocode"])
#     print("ActionID A: ", row["ActionA"])
#     print("ActionID B: ", row["ActionB"])
#     print("Expert label: ", row["PreferredAction"])

#     # Read the city data for the comparison
#     city_data = read_city_inventory(row["CityLocode"])
#     actionA = row["ActionA"]
#     actionB = row["ActionB"]

#     actionA_with_context = get_action_by_id(actions, actionA)
#     actionB_with_context = get_action_by_id(actions, actionB)

#     if actionA_with_context and actionB_with_context:
#         # Calculate the scoring based on the qualitative ranking system
#         qual_score = qualitative_score(
#             city_data, [actionA_with_context, actionB_with_context]
#         )

#         if qual_score:
#             winner = qual_score.actions[0].action_id
#             print(f"Winner: {winner}")

#             predicted_label = winner

#             return 1 if predicted_label == row["PreferredAction"] else 0
#     return None  # Skip this row if any issue occurs


# def get_accuracy_expert_vs_quali(df: pd.DataFrame, actions: list) -> float:
#     """Parallelized accuracy calculation for qualitative ranking."""

#     skipped = 0
#     score = 0

#     with concurrent.futures.ThreadPoolExecutor(
#         max_workers=70
#     ) as executor:  # Adjust max_workers if needed
#         future_to_index = {
#             executor.submit(process_row_quali, index, row, actions): index
#             for index, row in df.iterrows()
#         }

#         for future in concurrent.futures.as_completed(future_to_index):
#             result = future.result()
#             if result is not None:
#                 score += result
#             else:
#                 skipped += 1

#     print(f"\nSkipped {skipped} comparisons due to missing actions or errors.")

#     # Calculate accuracy
#     accuracy = score / len(df)
#     return accuracy


if __name__ == "__main__":

    # Setting this flag to True will use the full dataset for the benchmarking from the folder 'data/expert_labeled_actions'
    # Otherwise it will load the test split from the data folder 'ml/df_test_split.csv'
    use_full_dataset = False

    parent_dir = Path(__file__).parent.parent.parent

    if use_full_dataset:

        # Load all comparison data from the folder
        df_all_comparisons = load_data_from_folder(
            parent_dir / "data" / "expert_labeled_actions"
        )

        print(df_all_comparisons.head())
        print("Length before cleaning: ", len(df_all_comparisons))

        df_all_comparisons_cleaned = remove_irrelevant_rows(
            df_all_comparisons, remove_unsure=True
        )

        print("Length after cleaning: ", len(df_all_comparisons_cleaned))

    else:
        df_all_comparisons = pd.read_csv(
            parent_dir / "data" / "ml" / "df_test_split.csv"
        )
        print(df_all_comparisons.head())
        print("Length df:", len(df_all_comparisons))

        # Setting cleaned = all comparisons because the loaded df is already cleaned
        df_all_comparisons_cleaned = df_all_comparisons

    input("Press Enter to continue")

    actions = read_actions()

    # accuracy_quanti = get_accuracy_expert_vs_quanti(df_all_comparisons_cleaned, actions)
    # print(f"\nAccuracy for quantitative ranking is {accuracy_quanti}\n\n")

    # accuracy_ml = get_accuracy_expert_vs_ml(df_all_comparisons_cleaned, actions)
    # print(f"\nAccuracy for ML ranking is {accuracy_ml}\n\n")

    # # accuracy_quali = get_accuracy_expert_vs_quali(df_all_comparisons_cleaned, actions)
    # # print(f"\nAccuracy for qualitative ranking is {accuracy_quali}\n\n")

    # accuracy_consensus = get_accuracy_expert_vs_consensus(
    #     df_all_comparisons_cleaned, actions
    # )
    # print(f"\nAccuracy for consensus compare is {accuracy_consensus}\n\n")

    # accuracy_majority = get_accuracy_expert_vs_majority(
    #     df_all_comparisons_cleaned, actions
    # )
    # print(f"\nAccuracy for majority vote compare is {accuracy_majority}\n\n")

    (
        accuracy_quanti,
        accuracy_quali,
        accuracy_ml,
        accuracy_consensus,
        accuracy_majority,
    ) = get_accuracy_expert_vs_comparators(df_all_comparisons_cleaned, actions)

    # Final print out to not get lost in all the intermediate print statements
    print("Final result:\n")

    print(f"Accuracy for quantitative ranking is {accuracy_quanti}\n")
    print(f"Accuracy for qualitative ranking is {accuracy_quali}\n")
    print(f"Accuracy for ML ranking is {accuracy_ml}\n")
    print(f"Accuracy for consensus is {accuracy_consensus}\n")
    print(f"Accuracy for majority vote is {accuracy_majority}\n")
