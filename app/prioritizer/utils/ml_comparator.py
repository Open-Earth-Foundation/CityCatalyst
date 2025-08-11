"""
The ml_comparator is a function that compares two actions based on the given city data and action details.

Inputs:
- city: dict
- action_A: dict
- action_B: dict

Outputs:
- int: 1 if action A is preferred, -1 if action B is preferred.

The following fields are being used for the comparison:
Actions:
- Hazard
- CoBenefits
- GHGReductionPotential
- AdaptationEffectiveness
- CostInvestmentNeeded
- TimelineForImplementation

City:
- PopulationSize
- PopulationDensity
- Elevation
- StationaryEnergyEmissions
- TransportationEmissions
- WasteEmissions
- ippuEmissions
- afoluEmissions
- CCRA

After the transformation, the following fields are being used for the comparison:
- [action_GHGReductionPotential, city_stationaryEnergyEmissions, city_transportationEmissions, city_wasteEmissions, city_ippuEmissions, city_afoluEmissions] > EmissionReduction_Percentage_Diff
- CostInvestmentNeeded > CostInvestmentNeeded_Diff
- TimelineForImplementation > TimelineForImplementation_Diff
- [Hazard,AdaptationEffectiveness, CCRA] > weighted_risk_score_diff
- CoBenefits > CoBenefits_Diff_air_quality
- CoBenefits > CoBenefits_Diff_water_quality
- CoBenefits > CoBenefits_Diff_habitat
- CoBenefits > CoBenefits_Diff_cost_of_living
- CoBenefits > CoBenefits_Diff_housing
- CoBenefits > CoBenefits_Diff_mobility
- CoBenefits > CoBenefits_Diff_stakeholder_engagement
- (biome_tropical_rainforest) >>> being skipped in one hot encoding to prevent multicollinearity
- Biome > biome_temperate_forest
- Biome > biome_desert
- Biome > biome_grassland_savanna
- Biome > biome_tundra
- Biome > biome_wetlands
- Biome > biome_mountains
- Biome > biome_boreal_forest_taiga
- Biome > biome_coastal_marine
- ActionType > actionA_mitigation
- ActionType > actionA_adaptation
- ActionType > actionB_mitigation
- ActionType > actionB_adaptation
- PopulationSize > city_populationSize
- PopulationDensity > city_populationDensity
- Elevation > city_elevation

Raises:
    The function will raise an error if the dataframe is empty due to missing values.
    The function will raise an error if the action types are not valid.

Execute:
python -m app.prioritizer.utils.ml_comparator
"""

import pandas as pd
import xgboost as xgb
from pathlib import Path
import shap
import logging

# make the next line a relative import from the current file

from ..data.test_data import (
    dict_brcci,
    dict_icare_0141,
    dict_icare_0142,
    dict_icare_0145,
    dict_icare_0140,
    dict_ipcc_0005,
    dict_c40_0054,
    DUMMY_CITY,
)

# Setup logging configuration
logger = logging.getLogger(__name__)

root_path = Path(__file__).resolve().parent.parent.parent.parent

loaded_model = xgb.XGBClassifier()
# Load hyperparameters and trained weights
loaded_model.load_model(
    root_path
    / "app"
    / "prioritizer"
    / "data"
    / "ml"
    / "xgboost"
    / "model"
    / "xgb_model.json"
)
logger.debug(
    "Loaded XGBoost model from %s",
    root_path
    / "app"
    / "prioritizer"
    / "data"
    / "ml"
    / "xgboost"
    / "model"
    / "xgb_model.json",
)


def create_shap_waterfall(df: pd.DataFrame, model: xgb.XGBClassifier) -> None:
    """
    Create a SHAP waterfall plot for the given dataframe.
    The function will create a SHAP waterfall plot for the given dataframe.

    Args:
        df (pd.DataFrame): The dataframe to create the SHAP waterfall plot for.

    Returns:
        None
    """

    explainer = shap.TreeExplainer(model)

    # 3. Get SHAP values for that single row
    shap_values = explainer(df)

    # 4. Plot a waterfall for the first (and only) row
    shap.plots.waterfall(shap_values[0], max_display=30)


def ml_compare(city: dict, action_A: dict, action_B: dict) -> int:
    """
    Compare two actions based on the given city data and action details.

    Args:
    city (dict): The city data dictionary containing relevant information.
    action_A (dict): The details of the first action to compare.
    action_B (dict): The details of the second action to compare.

        Returns:
        int: 1 for action_A is preferred, -1 for action_B is preferred, 0 for uncertain prediction.

    Raises:
        ValueError: If the transformed dataframe contains keys with missing values.
        E.g. if fields like "CostInvestmentNeeded" are missing.
    """
    logger.debug(
        "Comparing actions: %s vs %s for city %s",
        action_A.get("ActionID"),
        action_B.get("ActionID"),
        city.get("locode"),
    )

    def build_df(city, action_A, action_B):
        """
        Create a DataFrame to hold the city data and the actions data.
        """
        data = {}

        # 1. Add action IDs directly (as the ActionA and ActionB columns)
        data["ActionA"] = action_A.get("ActionID")
        data["ActionB"] = action_B.get("ActionID")

        # 2. Add selected city attributes with a "city_" prefix
        city_keys = [
            "populationSize",
            "populationDensity",
            "elevation",
            "biome",
            "stationaryEnergyEmissions",
            "transportationEmissions",
            "wasteEmissions",
            "ippuEmissions",
            "afoluEmissions",
            "ccra",
        ]
        for key in city_keys:
            data[f"city_{key}"] = city.get(key)

        # 3. Add action-specific attributes with the appropriate prefixes
        action_keys = [
            "ActionType",
            "Hazard",
            "CoBenefits",
            "GHGReductionPotential",
            "AdaptationEffectiveness",
            "CostInvestmentNeeded",
            "TimelineForImplementation",
            "AdaptationEffectivenessPerHazard",
        ]
        for key in action_keys:
            data[f"actionA_{key}"] = action_A.get(key)
        for key in action_keys:
            data[f"actionB_{key}"] = action_B.get(key)

        # Create a DataFrame from the dictionary (each key becomes a column)
        df = pd.DataFrame([data])

        return df

    def prepare_emission_reduction_data_single_diff(df: pd.DataFrame) -> pd.DataFrame:
        """
        This function calculates the total reduction in emissions for each action,
        normalizes it by the total city emissions, and returns the percentage reduction for each action,
        along with the difference in reduction percentages between Action A and Action B.

        For example:
        - If Action A reduces the city emissions by 35% and Action B by 20%,
        the difference (actionA - actionB) is 15 percentage points.

        This normalization makes the result independent of the absolute magnitude of city emissions.
        """

        # Sector mapping between the column names in the action data and
        # the column namees in the city data received in the response body
        sector_mapping = {
            "stationary_energy": "city_stationaryEnergyEmissions",
            "transportation": "city_transportationEmissions",
            "waste": "city_wasteEmissions",
            "ippu": "city_ippuEmissions",
            "afolu": "city_afoluEmissions",
        }

        # Function to extract reduction potential safely
        def extract_ghg_value(ghg_dict, sector):
            """Extract numeric GHG reduction percentage for a given sector."""
            if isinstance(ghg_dict, dict) and sector in ghg_dict:
                value = ghg_dict[sector]
                if (
                    isinstance(value, str) and "-" in value
                ):  # Convert range "40-59" → 49.5
                    low, high = map(float, value.split("-"))
                    return (low + high) / 2
                elif isinstance(value, (int, float)):
                    return value
            return 0

        # Calculate total city emissions by summing emissions from all sectors
        df["total_city_emissions"] = df[list(sector_mapping.values())].sum(axis=1)

        # Log if total emissions is zero for debugging
        if (df["total_city_emissions"] == 0).any():
            logger.debug(
                "City has zero total emissions - emission reduction percentages will be set to 0"
            )

        # For each action, calculate total absolute reduction and convert to a percentage reduction
        for action in ["actionA", "actionB"]:
            ghg_column = f"{action}_GHGReductionPotential"  # Column containing the reduction potential (dict)
            total_abs_reduction_col = f"{action}_Total_Reduction"
            df[total_abs_reduction_col] = 0  # Initialize total reduction

            for sector, city_col in sector_mapping.items():
                if city_col in df.columns:
                    # Extract the GHG reduction percentage for the sector
                    reduction_pct_col = f"{action}_GHGReduction_{sector}"
                    df[reduction_pct_col] = df[ghg_column].apply(
                        lambda x: extract_ghg_value(x, sector)
                    )
                    # Compute the absolute reduction (in kg CO2 or relevant unit)
                    abs_reduction_col = f"{action}_EmissionReduction_{sector}"
                    df[abs_reduction_col] = df[reduction_pct_col] * df[city_col] / 100
                    # Accumulate the absolute reductions for the action
                    df[total_abs_reduction_col] += df[abs_reduction_col]

            # Normalize to get percentage reduction relative to total city emissions
            percentage_reduction_col = f"{action}_Percentage_Reduction"
            # Handle the case where total city emissions is zero
            df[percentage_reduction_col] = df.apply(
                lambda row: (
                    (row[total_abs_reduction_col] / row["total_city_emissions"]) * 100
                    if row["total_city_emissions"] > 0
                    else 0.0
                ),
                axis=1,
            )

        # Compute the percentage difference between Action A and Action B
        df["EmissionReduction_Percentage_Diff"] = (
            df["actionA_Percentage_Reduction"] - df["actionB_Percentage_Reduction"]
        )

        # Clean up intermediate columns while keeping the percentage reduction columns and final difference.
        intermediate_cols = []
        for action in ["actionA", "actionB"]:
            for sector in sector_mapping.keys():
                intermediate_cols.append(f"{action}_GHGReduction_{sector}")
                intermediate_cols.append(f"{action}_EmissionReduction_{sector}")
            intermediate_cols.append(f"{action}_Total_Reduction")
        # Also drop the original GHG Reduction Potential columns and city emissions columns if they are not needed.
        intermediate_cols += [
            "actionA_GHGReductionPotential",
            "actionB_GHGReductionPotential",
            "total_city_emissions",
            "actionA_Percentage_Reduction",
            "actionB_Percentage_Reduction",
        ] + list(sector_mapping.values())
        df.drop(columns=intermediate_cols, inplace=True)

        return df

    def prepare_action_type_data(df: pd.DataFrame) -> pd.DataFrame:
        """
        This function one-hot encodes the action type column.
        It allows as input a list of action types, e.g. ["mitigation", "adaptation"]
        It will return a dataframe with two columns, one for each action type.
        E.g. if the input is ["mitigation", "adaptation"], the output will be:
        mitigation	adaptation
        actionA	1	0
        actionB	0	1

        >>> If the input is not a list, or if it contains invalid action types, it will raise an error.
        """
        allowed_types = {"mitigation", "adaptation"}

        def encode(action_list, category):
            if not isinstance(action_list, list) or not action_list:
                raise ValueError("ActionType must be a non-empty list")
            if any(item not in allowed_types for item in action_list):
                raise ValueError(f"Invalid action types: {action_list}")
            return 1 if category in action_list else 0

        for action in ["actionA", "actionB"]:
            df[f"{action}_mitigation"] = df[f"{action}_ActionType"].apply(
                lambda x: encode(x, "mitigation")
            )
            df[f"{action}_adaptation"] = df[f"{action}_ActionType"].apply(
                lambda x: encode(x, "adaptation")
            )
            df.drop(columns=[f"{action}_ActionType"], inplace=True)

        return df

    def prepare_cost_investment_needed_data(df) -> pd.DataFrame:
        """
        This function maps the cost investment needed to a ranking.
        The higher the cost, the lower the ranking.
        """
        # Define cost ranking
        cost_mapping = {"low": 2, "medium": 1, "high": 0}

        # Apply mapping to both actionA and actionB
        df["actionA_CostInvestmentNeeded"] = df["actionA_CostInvestmentNeeded"].map(
            cost_mapping
        )
        df["actionB_CostInvestmentNeeded"] = df["actionB_CostInvestmentNeeded"].map(
            cost_mapping
        )

        # Compute difference between both actions
        df["CostInvestmentNeeded_Diff"] = (
            df["actionA_CostInvestmentNeeded"] - df["actionB_CostInvestmentNeeded"]
        )

        # Drop the original columns
        df.drop(
            columns=["actionA_CostInvestmentNeeded", "actionB_CostInvestmentNeeded"],
            inplace=True,
        )

        return df

    def prepare_timeline_data(df) -> pd.DataFrame:
        # Define timeline ranking
        timeline_mapping = {"<5 years": 2, "5-10 years": 1, ">10 years": 0}

        # Apply mapping to both actionA and actionB
        df["actionA_TimelineForImplementation"] = df[
            "actionA_TimelineForImplementation"
        ].map(timeline_mapping)
        df["actionB_TimelineForImplementation"] = df[
            "actionB_TimelineForImplementation"
        ].map(timeline_mapping)

        # Calculate the difference
        df["TimelineForImplementation_Diff"] = (
            df["actionA_TimelineForImplementation"]
            - df["actionB_TimelineForImplementation"]
        )

        # Drop old column
        df.drop(
            columns=[
                "actionA_TimelineForImplementation",
                "actionB_TimelineForImplementation",
            ],
            inplace=True,
        )

        return df

    def prepare_adaptation_effectiveness_data_per_hazard(
        df: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Converts the adaptation effectiveness per hazard (e.g. 'high', 'medium', 'low')
        into numeric values for each action.
        """
        adaptation_mapping = {"low": 1, "medium": 2, "high": 3}

        def map_effectiveness_dict(eff_dict):
            if isinstance(eff_dict, dict):
                return {k: adaptation_mapping.get(v, 0) for k, v in eff_dict.items()}
            return {}

        if "actionA_AdaptationEffectivenessPerHazard" in df.columns:
            df["actionA_AdaptationEffectivenessPerHazard"] = df[
                "actionA_AdaptationEffectivenessPerHazard"
            ].apply(map_effectiveness_dict)
        else:
            print(
                "Warning: 'actionA_AdaptationEffectivenessPerHazard' column not found."
            )

        if "actionB_AdaptationEffectivenessPerHazard" in df.columns:
            df["actionB_AdaptationEffectivenessPerHazard"] = df[
                "actionB_AdaptationEffectivenessPerHazard"
            ].apply(map_effectiveness_dict)
        else:
            print(
                "Warning: 'actionB_AdaptationEffectivenessPerHazard' column not found."
            )

        return df

    def prepare_city_risk_profile_per_hazard(df: pd.DataFrame) -> pd.DataFrame:
        """
        Extracts the city's risk profile from 'city_ccra'.
        The risk profile is a dict mapping hazards to the maximum normalized risk score.
        """

        def extract_risk_profile(ccra_data):
            risk_profile = {}
            if isinstance(ccra_data, list):
                for entry in ccra_data:
                    hazard = entry.get("hazard")
                    score = entry.get("normalised_risk_score")
                    if hazard is None or score is None:
                        continue
                    # Keep the highest score for each hazard
                    risk_profile[hazard] = max(risk_profile.get(hazard, 0), score)
            return risk_profile

        if "city_ccra" in df.columns:
            df["city_risk_profile"] = df["city_ccra"].apply(extract_risk_profile)
        else:
            print("Warning: 'city_ccra' column not found in DataFrame.")

        return df

    def match_action_hazards_with_city_risks_per_hazard(
        df: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Matches each action's list of hazards with the city's risk profile.
        Instead of returning a list of risk scores, this version returns a dictionary mapping
        each matching hazard to its risk score.
        """

        def get_matching_hazards(action_hazards, city_risk_profile):
            if not isinstance(action_hazards, list) or not isinstance(
                city_risk_profile, dict
            ):
                return {}
            return {
                hazard: city_risk_profile[hazard]
                for hazard in action_hazards
                if hazard in city_risk_profile
            }

        if "actionA_Hazard" in df.columns:
            df["actionA_matched_hazards"] = df.apply(
                lambda row: get_matching_hazards(
                    row.get("actionA_Hazard", []), row.get("city_risk_profile", {})
                ),
                axis=1,
            )
        else:
            print("Warning: 'actionA_Hazard' column not found.")

        if "actionB_Hazard" in df.columns:
            df["actionB_matched_hazards"] = df.apply(
                lambda row: get_matching_hazards(
                    row.get("actionB_Hazard", []), row.get("city_risk_profile", {})
                ),
                axis=1,
            )
        else:
            print("Warning: 'actionB_Hazard' column not found.")

        return df

    def create_weighted_comparative_feature_per_hazard(
        df: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        For each action, compute a weighted total risk score:
        - For each matched hazard, multiply the city's risk score by the action's effectiveness score (from the per-hazard dictionary).
        - Sum these values to get the action's weighted risk total.
        Then compute the difference: (Action A total - Action B total).
        """

        def compute_weighted_total(matched_hazards, adaptation_dict):
            total = 0
            if isinstance(matched_hazards, dict) and isinstance(adaptation_dict, dict):
                for hazard, risk in matched_hazards.items():
                    effectiveness = adaptation_dict.get(hazard, 0)
                    total += risk * effectiveness
            return total

        df["weighted_actionA_risk_total"] = df.apply(
            lambda row: compute_weighted_total(
                row.get("actionA_matched_hazards", {}),
                row.get("actionA_AdaptationEffectivenessPerHazard", {}),
            ),
            axis=1,
        )

        df["weighted_actionB_risk_total"] = df.apply(
            lambda row: compute_weighted_total(
                row.get("actionB_matched_hazards", {}),
                row.get("actionB_AdaptationEffectivenessPerHazard", {}),
            ),
            axis=1,
        )

        df["weighted_risk_score_Diff"] = (
            df["weighted_actionA_risk_total"] - df["weighted_actionB_risk_total"]
        )

        return df

    def process_ccra_hazards_adaptation_effectiveness_per_hazard(
        df: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Processes the DataFrame through the following steps:
        1. Extract the city's risk profile from 'city_ccra'.
        2. Convert each action's per-hazard adaptation effectiveness ratings to numeric values.
        3. Match the hazards from each action with the city's risk profile.
        4. Compute the weighted risk total for each action using the per-hazard values.
        5. Create the 'weighted_risk_score_Diff' feature.
        """
        df = prepare_city_risk_profile_per_hazard(df)
        df = match_action_hazards_with_city_risks_per_hazard(df)
        df = create_weighted_comparative_feature_per_hazard(df)

        # Optionally, drop intermediate columns, leaving only the final comparative feature.
        columns_to_drop = [
            "actionA_AdaptationEffectivenessPerHazard",
            "actionB_AdaptationEffectivenessPerHazard",
            "actionA_matched_hazards",
            "actionB_matched_hazards",
            "city_risk_profile",
            "city_ccra",
            "actionA_Hazard",
            "actionB_Hazard",
            "weighted_actionA_risk_total",
            "weighted_actionB_risk_total",
        ]
        df.drop(columns=columns_to_drop, inplace=True)
        return df

    def prepare_co_benefits_data_single_diff(df) -> pd.DataFrame:
        """
        This function returns the difference between the co-benefits of actionA and actionB.
        A positive value means action A is better.
        A negative value means action B is better.

        It takes the total difference into account.

        Each co-benefit can have a score between -2 and 2.
        There are 7 co-benefits:

        air_quality, water_quality, habitat, cost_of_living, housing, mobility, stakeholder_engagement

        Return values are between -14 amd 14.
        """

        # List of co-benefit keys
        co_benefits_keys = [
            "air_quality",
            "water_quality",
            "habitat",
            "cost_of_living",
            "housing",
            "mobility",
            "stakeholder_engagement",
        ]

        def compare_total_benefit(row):
            if isinstance(row["actionA_CoBenefits"], dict) and isinstance(
                row["actionB_CoBenefits"], dict
            ):
                a_total = sum(
                    row["actionA_CoBenefits"].get(k, 0) for k in co_benefits_keys
                )
                b_total = sum(
                    row["actionB_CoBenefits"].get(k, 0) for k in co_benefits_keys
                )
                return a_total - b_total
            else:
                return

        # Apply comparison
        df["CoBenefits_Diff_total"] = df.apply(compare_total_benefit, axis=1)

        # Drop the original CoBenefits dictionary columns
        df.drop(columns=["actionA_CoBenefits", "actionB_CoBenefits"], inplace=True)

        return df

    def prepare_biome_data(df) -> pd.DataFrame:

        # List of possible biome categories
        biome_categories = [
            "tropical_rainforest",
            "temperate_forest",
            "desert",
            "grassland_savanna",
            "tundra",
            "wetlands",
            "mountains",
            "boreal_forest_taiga",
            "coastal_marine",
        ]

        # Apply one-hot encoding, keeping all but one column
        # We start with the second colum to skip the first category and to drop it
        # This is to avoid multicollinearity in mutually exclusive one-hot encoding
        for biome in biome_categories[1:]:
            df[f"biome_{biome}"] = (df["city_biome"] == biome).astype(int)

        # Drop the original categorical column
        df.drop(columns=["city_biome"], inplace=True)

        return df

    def prepare_final_features(df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare the final features for the ML model by applying all the necessary transformations.

        Parameters:
            df (pd.DataFrame): The input DataFrame.

        Returns:
            pd.DataFrame: The DataFrame with final features.
        """
        # Remove columns ActionA and ActionB
        df.drop(
            columns=[
                "city_populationSize",
                "city_populationDensity",
                "city_elevation",
                "ActionA",
                "ActionB",
                "actionA_mitigation",
                "actionB_mitigation",
                "actionA_adaptation",
                "actionB_adaptation",
                "biome_desert",
                "biome_grassland_savanna",
                "biome_tundra",
                "biome_wetlands",
                "biome_mountains",
                "biome_boreal_forest_taiga",
                "biome_coastal_marine",
                "biome_temperate_forest",
                "actionA_AdaptationEffectiveness",
                "actionB_AdaptationEffectiveness",
            ],
            inplace=True,
        )

        return df

    def predict_xgb(
        df: pd.DataFrame, threshold: float = 0.5, margin: float = 0.0
    ) -> int:
        """
        Make a prediction based on the input DataFrame using probabilities and a custom margin.

        Parameters:
            df (pd.DataFrame): The input DataFrame with transformed features.
            threshold (float): Probability threshold for classification (default: 0.5).
            margin (float): Margin around threshold for uncertain predictions (default: 0.1).
                             If probability is within [threshold-margin, threshold+margin],
                             the prediction is considered uncertain.

        Returns:
            int: The predicted label (1 for Action A, -1 for Action B).
        """

        # Get probability predictions using the model
        # predict_proba returns probabilities for each class [P(class_0), P(class_1)]
        probabilities = loaded_model.predict_proba(df)

        # Extract probability for first element of the array (only one element) and Action A (class 1)
        prob_action_a = probabilities[0][1]

        # Define decision boundaries
        lower_bound = threshold - margin
        upper_bound = threshold + margin

        # model.predict returns 1 for probability > 0.5 and 0 for probability <= 0.5
        # We can model this behaviour here with .predict_proba to have more control over the margin
        # However, this would only be fully relevant in a multi-class (e.g. 1, 0, -1) setting
        if prob_action_a > upper_bound:
            return 1  # Action A is preferred
        else:
            return -1

    # Build the DataFrame for comparison consisting of the city and the two actions
    df = build_df(city, action_A, action_B)

    # Create a copy of the DataFrame to avoid modifying the original
    df_transformed = df.copy()

    # Prepare the data for ML comparison (feature engineering)
    df_transformed = prepare_emission_reduction_data_single_diff(df_transformed)
    df_transformed = prepare_action_type_data(df_transformed)
    df_transformed = prepare_cost_investment_needed_data(df_transformed)
    df_transformed = prepare_timeline_data(df_transformed)
    df_transformed = prepare_adaptation_effectiveness_data_per_hazard(df_transformed)
    df_transformed = process_ccra_hazards_adaptation_effectiveness_per_hazard(
        df_transformed
    )
    df_transformed = prepare_co_benefits_data_single_diff(df_transformed)
    df_transformed = prepare_biome_data(df_transformed)

    # Final feature cleanup, removing all columns that are not used in the model
    df_transformed = prepare_final_features(df_transformed)

    # Before dropping rows, check which columns have missing values
    missing_columns = df_transformed.columns[df_transformed.isna().any()].tolist()
    # Dropping empty rows
    # If after transformation a row has missing values, it will be dropped
    # Since we only pass in one pair at a time, the df will be empty if there are missing values
    df_transformed.dropna(inplace=True)

    if df_transformed.empty:
        error_message = (
            f"ml_comparator.py:\n"
            f"Empty dataframe due to missing values!\n"
            f"City: {city['locode']}\n"
            f"Action A: {action_A['ActionID']}\n"
            f"Action B: {action_B['ActionID']}\n"
            f"Columns with missing values: {missing_columns}"
        )
        logger.error(error_message)
        raise ValueError(error_message)

    logger.debug("DataFrame input for model: \n%s", df_transformed.T)

    # Make a prediction with the model
    # You can customize threshold and margin here with e.g. threshold=0.5 and margin=0.025
    # Only use for multi-class (e.g. 1, 0, -1) setting
    # If used, predict_xgb return values need to be adjusted.
    prediction = predict_xgb(df_transformed)

    # (Optional for explanation) Create a SHAP waterfall plot
    # create_shap_waterfall(df_transformed, loaded_model)

    return prediction


if __name__ == "__main__":
    # This is the same data used as in colab.
    # Notice: We changed the city data and the data we now use in production is different.
    # We cannot use the new city data for training, because the experts ranked on the old city data.
    # Therefore essentially all the new city data 'is new' to the model.
    # Here we use the same data to make sure we have the same pipeline in place both in this repo and in colab.

    # result = ml_compare(dict_brcci, dict_icare_0145, dict_icare_0140)
    # result = ml_compare(DUMMY_CITY, dict_ipcc_0005, dict_c40_0054)
    # result = ml_compare(DUMMY_CITY, dict_c40_0054, dict_ipcc_0005)
    # result = ml_compare(dict_brcci, dict_icare_0141, dict_icare_0142)
    result = ml_compare(dict_brcci, dict_ipcc_0005, dict_c40_0054)
    print("Test completed. Preferred Action: %s", result)
