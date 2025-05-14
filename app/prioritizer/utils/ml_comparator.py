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
python -m prioritizer.utils.ml_comparator
"""

import pandas as pd
import xgboost as xgb
from pathlib import Path
import shap
import logging
from utils.logging_config import setup_logger

# Set up logger for this module
logger = logging.getLogger(__name__)

root_path = Path(__file__).resolve().parent.parent.parent.parent

loaded_model = xgb.XGBClassifier()
# Load hyperparameters and trained weights
loaded_model.load_model(
    root_path / "app" / "prioritizer" / "data" / "ml" / "model" / "xgb_model.json"
)
logger.debug(
    "Loaded XGBoost model from %s",
    root_path / "app" / "prioritizer" / "data" / "ml" / "model" / "xgb_model.json",
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
    int: 1 for action_A is preferred, -1 for action_B is preferred.

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
            df[percentage_reduction_col] = (
                df[total_abs_reduction_col] / df["total_city_emissions"]
            ) * 100

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

    def predict_xgb(df: pd.DataFrame) -> int:
        """
        Make a prediction based on the input DataFrame.

        Parameters:
            df (pd.DataFrame): The input DataFrame with transformed features.

        Returns:
            int: The predicted label (1 for Action A, -1 for Action B).
        """

        # Make a prediction using the model
        prediction = loaded_model.predict(df)

        # XBBoost model returns 1 for Action A and 0 for Action B
        # Convert the prediction to the expected output format (1 or -1)
        if prediction == 1:
            return 1
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
    # input("Press Enter to continue...")

    # Make a prediction with the model
    prediction = predict_xgb(df_transformed)

    # (Optional for explanation) Create a SHAP waterfall plot
    # create_shap_waterfall(df_transformed, loaded_model)

    return prediction


if __name__ == "__main__":
    # Set up logging configuration
    setup_logger(level=logging.DEBUG)

    # Calling it with test data
    logger.info("Starting ml_comparator test run")

    # This is the same data used as in colab.
    # Notice: We changed the city data and the data we now use in production is different.
    # We cannot use the new city data for training, because the experts ranked on the old city data.
    # Therefore essentially all the new city data 'is new' to the model.
    # Here we use the same data to make sure we have the same pipeline in place both in this repo and in colab.
    dict_brcci = {
        "locode": "BRCCI",
        "name": "Camaçari",
        "region": "BR-BA",
        "regionName": "Bahia",
        "populationSize": 300372,
        "populationDensity": 382.43,
        "area": 758.73,
        "elevation": 36,
        "biome": "tropical_rainforest",
        "socioEconomicFactors": {"lowIncome": "very_high"},
        "accessToPublicServices": {
            "inadequateWaterAccess": "very_low",
            "inadequateSanitation": "low",
        },
        "totalEmissions": 3390145659.0,
        "stationaryEnergyEmissions": 176766789.0,
        "transportationEmissions": 295693000.0,
        "wasteEmissions": 1124796988.0,
        "ippuEmissions": 1720470000,
        "afoluEmissions": 72418882.0,
        "scope1Emissions": 3214434494.0,
        "scope2Emissions": 171982146.0,
        "scope3Emissions": 3729019.0,
        "ccra": [
            {
                "keyimpact": "public health",
                "hazard": "diseases",
                "normalised_risk_score": 0.99,
            },
            {
                "keyimpact": "water resources",
                "hazard": "droughts",
                "normalised_risk_score": 0.35978153341031,
            },
            {
                "keyimpact": "food security",
                "hazard": "droughts",
                "normalised_risk_score": 0.644653441267234,
            },
            {
                "keyimpact": "energy security",
                "hazard": "droughts",
                "normalised_risk_score": 0.989051161784754,
            },
            {
                "keyimpact": "biodiversity",
                "hazard": "droughts",
                "normalised_risk_score": 0.0625445839710777,
            },
            {
                "keyimpact": "public health",
                "hazard": "heatwaves",
                "normalised_risk_score": 0.99,
            },
            {
                "keyimpact": "infrastructure",
                "hazard": "heatwaves",
                "normalised_risk_score": 0.493855416086134,
            },
            {
                "keyimpact": "biodiversity",
                "hazard": "heatwaves",
                "normalised_risk_score": 0.223576599435519,
            },
            {
                "keyimpact": "energy security",
                "hazard": "heatwaves",
                "normalised_risk_score": 0.99,
            },
            {
                "keyimpact": "infrastructure",
                "hazard": "landslides",
                "normalised_risk_score": 0.797726778999126,
            },
            {
                "keyimpact": "food security",
                "hazard": "floods",
                "normalised_risk_score": 0.99,
            },
            {
                "keyimpact": "infrastructure",
                "hazard": "sea-level-rise",
                "normalised_risk_score": 0.00,
            },
        ],
    }

    dict_icare_0075 = {
        "ActionID": "icare_0075",
        "ActionName": "Set carbon emissions reduction targets for industrial sectors",
        "ActionType": ["mitigation"],
        "Hazard": None,
        "Sector": ["ippu"],
        "Subsector": ["industrial_processes"],
        "PrimaryPurpose": ["ghg_reduction"],
        "Description": "Establish clear and achievable carbon emissions reduction goals for industries and require periodic reporting to ensure progress.",
        "CoBenefits": {
            "air_quality": 2,
            "water_quality": 1,
            "habitat": 1,
            "cost_of_living": 0,
            "housing": 0,
            "mobility": 0,
            "stakeholder_engagement": 2,
        },
        "EquityAndInclusionConsiderations": None,
        "GHGReductionPotential": {
            "stationary_energy": None,
            "transportation": None,
            "waste": None,
            "ippu": "80-100",
            "afolu": None,
        },
        "AdaptationEffectiveness": None,
        "CostInvestmentNeeded": "low",
        "TimelineForImplementation": "5-10 years",
        "Dependencies": [
            "Development of a standardized carbon emissions measurement and reporting system.",
            "Creation of regulatory frameworks to enforce emissions reduction goals.",
            "Capacity-building for industries to monitor and report emissions effectively.",
        ],
        "KeyPerformanceIndicators": [
            "Percentage of industries with established carbon reduction targets (%).",
            "Reduction in total sectoral GHG emissions compared to baseline (tons of CO\u2082e).",
            "Increase in adoption of renewable energy sources by industries (%).",
        ],
        "PowersAndMandates": ["local"],
    }

    dict_c40_0009 = {
        "ActionID": "c40_0009",
        "ActionName": "New Building Standards",
        "ActionType": ["mitigation"],
        "Hazard": None,
        "Sector": ["stationary_energy"],
        "Subsector": ["all"],
        "PrimaryPurpose": ["ghg_reduction"],
        "Description": '"New Building Standards" set guidelines for environmentally responsible construction, ensuring that new structures adhere to energy-efficient practices, thereby reducing carbon emissions and promoting sustainable urban development.',
        "CoBenefits": {
            "air_quality": 1,
            "water_quality": 0,
            "habitat": 0,
            "cost_of_living": 0,
            "housing": -1,
            "mobility": 0,
            "stakeholder_engagement": 0,
        },
        "EquityAndInclusionConsiderations": 'The "New Building Standards" promote equity and inclusion by ensuring that all new constructions, including those in vulnerable or underserved communities, adhere to energy-efficient practices. This helps to reduce energy costs for residents, making housing more affordable and accessible. Additionally, by prioritizing sustainable urban development, these standards can lead to improved living conditions and health outcomes in these communities, which often face disproportionate environmental burdens. Furthermore, the implementation of these standards can create job opportunities in green construction, benefiting local workers and fostering economic empowerment in underserved areas. Overall, the action considers the needs of vulnerable populations by promoting sustainable practices that enhance their quality of life and economic stability.',
        "GHGReductionPotential": {
            "stationary_energy": "0-19",
            "transportation": None,
            "waste": None,
            "ippu": None,
            "afolu": None,
        },
        "AdaptationEffectiveness": None,
        "CostInvestmentNeeded": "low",
        "TimelineForImplementation": "<5 years",
        "Dependencies": [
            "Regulatory framework to enforce building standards",
            "Availability of sustainable construction materials",
            "Training and education for builders and architects on energy-efficient practices",
            "Monitoring and evaluation systems to assess compliance with standards",
            "Public awareness and support for sustainable building practices",
        ],
        "KeyPerformanceIndicators": [
            "Reduction in carbon emissions from new buildings",
            "Percentage of new buildings meeting energy efficiency standards",
            "Increase in the use of sustainable materials in construction",
            "Number of buildings certified under green building standards",
            "Energy consumption reduction in new constructions",
            "Percentage of urban development projects incorporating green spaces",
        ],
        "PowersAndMandates": None,
        "AdaptationEffectivenessPerHazard": None,
        "biome": "none",
    }

    dict_c40_0023 = {
        "ActionID": "c40_0023",
        "ActionName": "Bus Emissions",
        "ActionType": ["mitigation"],
        "Hazard": None,
        "Sector": ["transportation"],
        "Subsector": ["on-road"],
        "PrimaryPurpose": ["ghg_reduction"],
        "Description": '"Bus Emissions" mitigation focuses on reducing the environmental impact of bus fleets. Implementing cleaner technologies and fuels helps minimize emissions, contributing to improved air quality and sustainable urban transportation.',
        "CoBenefits": {
            "air_quality": 1,
            "water_quality": 0,
            "habitat": 0,
            "cost_of_living": 0,
            "housing": 0,
            "mobility": 0,
            "stakeholder_engagement": 0,
        },
        "EquityAndInclusionConsiderations": 'The "Bus Emissions" mitigation action promotes equity and inclusion by targeting improvements in air quality, which directly benefits vulnerable and underserved communities that are often disproportionately affected by pollution. By implementing cleaner technologies and fuels in bus fleets, the action reduces harmful emissions in areas where low-income populations and marginalized groups reside, thereby addressing environmental justice concerns. Additionally, enhancing urban transportation through cleaner buses ensures that all community members, including those who rely on public transit, have access to healthier and more sustainable transportation options. This approach fosters inclusivity by prioritizing the needs of those who may have limited mobility or financial resources, ensuring that the benefits of cleaner air and improved transit are equitably distributed.',
        "GHGReductionPotential": {
            "stationary_energy": None,
            "transportation": "20-39",
            "waste": None,
            "ippu": None,
            "afolu": None,
        },
        "AdaptationEffectiveness": None,
        "CostInvestmentNeeded": "medium",
        "TimelineForImplementation": "<5 years",
        "Dependencies": [
            "Availability of cleaner technologies and fuels for bus fleets",
            "Investment in infrastructure to support cleaner bus operations",
            "Regulatory support and incentives for adopting low-emission buses",
            "Public awareness and acceptance of cleaner transportation options",
            "Collaboration between government, transit authorities, and manufacturers",
        ],
        "KeyPerformanceIndicators": [
            "Reduction in CO2 emissions (tons)",
            "Percentage of bus fleet using clean technologies",
            "Fuel efficiency of bus fleet (miles per gallon)",
            "Number of buses retrofitted or replaced with cleaner models",
            "Air quality improvement metrics (e.g., PM2.5 levels)",
            "Public transportation ridership rates",
            "Cost savings from fuel efficiency improvements",
            "Percentage reduction in nitrogen oxides (NOx) emissions",
        ],
        "PowersAndMandates": None,
        "AdaptationEffectivenessPerHazard": None,
        "biome": "none",
    }

    dict_icare_0145 = {
        "ActionID": "icare_0145",
        "ActionName": "Strengthen the healthcare network to attend to climate victims",
        "ActionType": ["adaptation"],
        "Hazard": [
            "heatwaves",
            "diseases",
            "landslides",
            "floods",
            "storms",
            "droughts",
        ],
        "Sector": None,
        "Subsector": None,
        "PrimaryPurpose": ["climate_resilience"],
        "Description": "Improve the infrastructure of healthcare units to assist people who require medical care due to impacts associated with climate risks (climate victims), such as those affected by heat waves or floods, especially in more vulnerable areas. Develop action plans to prepare the healthcare network for extreme climate-related situations.",
        "CoBenefits": {
            "air_quality": 0,
            "water_quality": 0,
            "habitat": 0,
            "cost_of_living": 0,
            "housing": 0,
            "mobility": 0,
            "stakeholder_engagement": 2,
        },
        "EquityAndInclusionConsiderations": None,
        "GHGReductionPotential": None,
        "AdaptationEffectiveness": "high",
        "CostInvestmentNeeded": "high",
        "TimelineForImplementation": ">10 years",
        "Dependencies": [
            "Investment in the renovation and expansion of healthcare facilities, ensuring they are equipped to handle climate-related health impacts, particularly in vulnerable areas.",
            "Development of action plans and training programs for healthcare professionals to respond to extreme climate events like heatwaves and floods.",
            "Collaboration with local authorities, emergency response teams, and climate experts to create a comprehensive framework for preparing the healthcare network for climate risks.",
        ],
        "KeyPerformanceIndicators": [
            "Number of healthcare facilities upgraded for climate-related emergencies.",
            "Increase in healthcare staff trained in climate emergency response (%).",
            "Number of climate-related injuries treated successfully.",
            ".",
        ],
        "PowersAndMandates": ["national"],
        "AdaptationEffectivenessPerHazard": {
            "heatwaves": "high",
            "diseases": "medium",
            "landslides": "medium",
            "floods": "high",
            "storms": "high",
            "droughts": "medium",
        },
    }

    dict_icare_0140 = {
        "ActionID": "icare_0140",
        "ActionName": "Landslide Risk Assessment and Management",
        "ActionType": ["adaptation"],
        "Hazard": ["landslides"],
        "Sector": None,
        "Subsector": None,
        "PrimaryPurpose": ["climate_resilience"],
        "Description": "This action involves assessing and managing landslide risks by collecting data, mapping hazard areas, and conducting evacuation simulations. It aims to reduce the risks associated with landslides in areas prone to these events.",
        "CoBenefits": {
            "air_quality": 1,
            "water_quality": 2,
            "habitat": 2,
            "cost_of_living": 1,
            "housing": 1,
            "mobility": 1,
            "stakeholder_engagement": 2,
        },
        "EquityAndInclusionConsiderations": None,
        "GHGReductionPotential": None,
        "AdaptationEffectiveness": "high",
        "CostInvestmentNeeded": "low",
        "TimelineForImplementation": "<5 years",
        "Dependencies": [
            "Comprehensive planning and policy framework",
            "Stakeholder participation",
            "Capacity building and institutional support",
        ],
        "KeyPerformanceIndicators": [
            "Coastal erosion rates",
            "Water quality",
            "Habitat health",
        ],
        "PowersAndMandates": ["local"],
        "AdaptationEffectivenessPerHazard": {"landslides": "high"},
    }

    dict_icare_0141 = {
        "ActionID": "icare_0141",
        "ActionName": "Implementation of Wetlands",
        "ActionType": ["adaptation"],
        "Hazard": ["diseases", "floods"],
        "Sector": None,
        "Subsector": None,
        "PrimaryPurpose": ["climate_resilience"],
        "Description": "Implementation of wetlands using phytoremediation to remove pollutants from water and improve water quality.",
        "CoBenefits": {
            "air_quality": 1,
            "water_quality": 2,
            "habitat": 1,
            "cost_of_living": 1,
            "housing": 0,
            "mobility": 0,
            "stakeholder_engagement": 1,
        },
        "EquityAndInclusionConsiderations": None,
        "GHGReductionPotential": None,
        "AdaptationEffectiveness": "low",
        "CostInvestmentNeeded": "medium",
        "TimelineForImplementation": "<5 years",
        "Dependencies": ["Maintenance"],
        "KeyPerformanceIndicators": [
            "Water quality improvement",
            "Water flow rate",
            "Maintenance costs",
        ],
        "PowersAndMandates": ["local"],
        "AdaptationEffectivenessPerHazard": {"diseases": "low", "floods": "low"},
        "biome": "wetlands",
    }

    dict_icare_0142 = {
        "ActionID": "icare_0142",
        "ActionName": "Improvement of Water Supply and Sanitation Systems",
        "ActionType": ["adaptation"],
        "Hazard": ["floods"],
        "Sector": None,
        "Subsector": None,
        "PrimaryPurpose": ["climate_resilience"],
        "Description": "This action involves implementing artesian wells, cisterns, and water supply systems, as well as improving water quality and expanding sanitation services in the city.",
        "CoBenefits": {
            "air_quality": 0,
            "water_quality": 2,
            "habitat": 1,
            "cost_of_living": 1,
            "housing": 1,
            "mobility": 0,
            "stakeholder_engagement": 1,
        },
        "EquityAndInclusionConsiderations": None,
        "GHGReductionPotential": None,
        "AdaptationEffectiveness": "high",
        "CostInvestmentNeeded": "medium",
        "TimelineForImplementation": "<5 years",
        "Dependencies": [
            "Infrastructure development",
            "Financial resources",
            "Technical expertise",
        ],
        "KeyPerformanceIndicators": [
            "Access to safe water",
            "Water quality",
            "Sanitation coverage",
        ],
        "PowersAndMandates": ["local"],
        "AdaptationEffectivenessPerHazard": {"floods": "high"},
        "biome": "none",
    }

    # result = ml_compare(dict_brcci, dict_icare_0145, dict_icare_0140)
    result = ml_compare(dict_brcci, dict_c40_0009, dict_icare_0075)
    # result = ml_compare(dict_brcci, dict_icare_0141, dict_icare_0142)
    logger.info("Test completed. Preferred Action: %s", result)
