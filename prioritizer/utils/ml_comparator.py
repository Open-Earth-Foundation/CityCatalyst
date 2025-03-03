import pickle
import pandas as pd
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
from pathlib import Path

root_path = Path(__file__).resolve().parent.parent.parent

# Load the scaler from the saved file
with open(Path(root_path / "data" / "ml" / "scaler" / "scaler.pkl"), "rb") as f:
    scaler = pickle.load(f)

loaded_model = xgb.XGBClassifier()
# Load hyperparameters and trained weights
loaded_model.load_model(root_path / "data" / "ml" / "model" / "xgb_model.json")


def ml_compare(city: dict, action_A: dict, action_B: dict) -> int:
    """
    Compare two actions based on the given city data and action details.

    Args:
    city (dict): The city data dictionary containing relevant information.
    action_A (dict): The details of the first action to compare.
    action_B (dict): The details of the second action to compare.

    Returns:
    int: 1 for action_A is preferred, -1 for action_B is preferred.
    """

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
            "industrialProcessEmissions",
            "landUseEmissions",
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
        ]
        for key in action_keys:
            data[f"actionA_{key}"] = action_A.get(key)
        for key in action_keys:
            data[f"actionB_{key}"] = action_B.get(key)

        # Create a DataFrame from the dictionary (each key becomes a column)
        df = pd.DataFrame([data])

        return df

    # Build the DataFrame for comparison
    df = build_df(city, action_A, action_B)
    # print(df)
    # print(df.columns)

    # print all the values for each column
    # for col in df.columns:
    #     print(f"{col}: {df[col].values[0]}")

    # Converting the label is not needed here since we only do predictions
    # def convert_preferred_action_to_binary_labels(df):
    #     """
    #     Converts the PreferredAction column into binary labels.
    #     - 1 if PreferredAction is ActionA
    #     - 0 if PreferredAction is ActionB
    #     """
    #     df_copy = df.copy()  # Avoid modifying the original dataframe
    #     df_copy["y"] = df_copy.apply(
    #         lambda row: (
    #             1
    #             if row["PreferredAction"] == row["ActionA"]
    #             else -1 if row["PreferredAction"] == row["ActionB"] else None
    #         ),  # 0 For small dataset 0 gives best restult with 83%
    #         axis=1,
    #     )

    #     # Optional: Drop rows where PreferredAction is neither ActionA nor ActionB
    #     df_copy = df_copy.drop(columns=["PreferredAction"])

    #     return df_copy

    def prepare_emission_reduction_data(df: pd.DataFrame) -> pd.DataFrame:
        """
        This function combines the city emissions per sector and the GHG emission reduction potential into one column
        containing the absolute reduction difference between two actions.

        E.g.
        actionA has reduction potential of 10% for transportation
        actionB has reduction potential of 20% for transportation
        city has 1000 kg CO2 in transportation

        actionA reduces by 100 kg CO2
        actionB reduces by 200 kg CO2
        The difference is actionA - actionB = -100
        This will be in a dedicated column
        """

        # Create a local copy
        df_copy = df.copy()

        sector_mapping = {
            "stationary_energy": "city_stationaryEnergyEmissions",
            "transportation": "city_transportationEmissions",
            "waste": "city_wasteEmissions",
            "ippu": "city_industrialProcessEmissions",
            "afolu": "city_landUseEmissions",
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
                    return value  # Use numeric values directly
            return 0  # Default to 0 if missing or null

        # Extract GHG Reduction values and compute absolute reductions
        for action in ["actionA", "actionB"]:
            ghg_column = (
                f"{action}_GHGReductionPotential"  # This column contains the dictionary
            )

            for (
                sector,
                city_column,
            ) in sector_mapping.items():  # Map GHG sector names to city emission names
                if (
                    city_column in df_copy.columns
                ):  # Ensure the city emissions column exists

                    # Extract GHG reduction percentage
                    df_copy[f"{action}_GHGReduction_{sector}"] = df_copy[
                        ghg_column
                    ].apply(lambda x: extract_ghg_value(x, sector))

                    # Compute absolute reduction impact
                    df_copy[f"{action}_EmissionReduction_{sector}"] = (
                        df_copy[f"{action}_GHGReduction_{sector}"]
                        * df_copy[city_column]
                        / 100
                    )

        # Compute differences in emission reductions between Action A and B
        # A positive value means that action A has higher emissions reduction
        # A negative value means that action B has higher emissions reduction
        for sector in sector_mapping.keys():
            df_copy[f"EmissionReduction_Diff_{sector}"] = (
                df_copy[f"actionA_EmissionReduction_{sector}"]
                - df_copy[f"actionB_EmissionReduction_{sector}"]
            )

        # Drop the original GHG Reduction Potential columns (nested dictionaries)
        df_copy.drop(
            columns=["actionA_GHGReductionPotential", "actionB_GHGReductionPotential"],
            inplace=True,
        )

        # Drop intermediate extracted GHG percentage columns
        drop_columns = [
            f"{action}_GHGReduction_{sector}"
            for action in ["actionA", "actionB"]
            for sector in sector_mapping.keys()
        ]
        df_copy.drop(columns=drop_columns, inplace=True)
        drop_columns = [
            f"{action}_EmissionReduction_{sector}"
            for action in ["actionA", "actionB"]
            for sector in sector_mapping.keys()
        ]
        df_copy.drop(columns=drop_columns, inplace=True)

        # Drop the original emissions columns (if they are not needed anymore)
        df_copy.drop(columns=list(sector_mapping.values()), inplace=True)

        return df_copy

    def prepare_action_type_data(df) -> pd.DataFrame:

        # Create local copy
        df_copy = df.copy()

        # Function to one-hot encode ActionType lists
        def one_hot_encode_action_type(action_type_list, category):
            """Check if category exists in the list and return 1 or 0."""
            if isinstance(action_type_list, list):  # Ensure it's a list
                return 1 if category in action_type_list else 0
            return 0  # Default to 0 if missing

        # Apply encoding for both actions
        for action in ["actionA", "actionB"]:
            df_copy[f"{action}_mitigation"] = df_copy[f"{action}_ActionType"].apply(
                lambda x: one_hot_encode_action_type(x, "mitigation")
            )
            df_copy[f"{action}_adaptation"] = df_copy[f"{action}_ActionType"].apply(
                lambda x: one_hot_encode_action_type(x, "adaptation")
            )

        # Drop the original multi-label categorical columns
        df_copy.drop(columns=["actionA_ActionType", "actionB_ActionType"], inplace=True)

        return df_copy

    def prepare_cost_investment_needed_data(df) -> pd.DataFrame:

        # Create local copy
        df_copy = df.copy()

        # Define cost ranking
        cost_mapping = {"low": 2, "medium": 1, "high": 0}

        # Apply mapping to both actionA and actionB
        df_copy["actionA_CostInvestmentNeeded"] = df_copy[
            "actionA_CostInvestmentNeeded"
        ].map(cost_mapping)
        df_copy["actionB_CostInvestmentNeeded"] = df_copy[
            "actionB_CostInvestmentNeeded"
        ].map(cost_mapping)

        # Compute difference between both actions
        df_copy["CostInvestmentNeeded_Diff"] = (
            df_copy["actionA_CostInvestmentNeeded"]
            - df_copy["actionB_CostInvestmentNeeded"]
        )

        # Drop the original columns
        df_copy.drop(
            columns=["actionA_CostInvestmentNeeded", "actionB_CostInvestmentNeeded"],
            inplace=True,
        )

        return df_copy

    def prepare_timeline_data(df) -> pd.DataFrame:

        # Create local copy
        df_copy = df.copy()

        # Define timeline ranking
        timeline_mapping = {"<5 years": 2, "5-10 years": 1, ">10 years": 0}

        # Apply mapping to both actionA and actionB
        df_copy["actionA_TimelineForImplementation"] = df_copy[
            "actionA_TimelineForImplementation"
        ].map(timeline_mapping)
        df_copy["actionB_TimelineForImplementation"] = df_copy[
            "actionB_TimelineForImplementation"
        ].map(timeline_mapping)

        # Calculate the difference
        df_copy["TimelineForImplementation_Diff"] = (
            df_copy["actionA_TimelineForImplementation"]
            - df_copy["actionB_TimelineForImplementation"]
        )

        # Drop old column
        df_copy.drop(
            columns=[
                "actionA_TimelineForImplementation",
                "actionB_TimelineForImplementation",
            ],
            inplace=True,
        )

        return df_copy

    def prepare_adaptation_effectiveness_data(df) -> pd.DataFrame:

        # Create local copy
        df_copy = df.copy()

        # Define adaptation effectiveness ranking
        adaptation_mapping = {"low": 1, "medium": 2, "high": 3}

        # Apply mapping with proper handling for None or missing keys by returning 0
        df_copy["actionA_AdaptationEffectiveness"] = df_copy[
            "actionA_AdaptationEffectiveness"
        ].map(lambda x: adaptation_mapping.get(x, 0))
        df_copy["actionB_AdaptationEffectiveness"] = df_copy[
            "actionB_AdaptationEffectiveness"
        ].map(lambda x: adaptation_mapping.get(x, 0))

        # Compute difference
        # df_cleaned['AdaptationEffectiveness_Diff'] = (
        #     df_cleaned['actionA_AdaptationEffectiveness'] - df_cleaned['actionB_AdaptationEffectiveness']
        # )

        # Drop old colums
        # df_cleaned.drop(columns=['actionA_AdaptationEffectiveness', 'actionB_AdaptationEffectiveness'], inplace=True)

        return df_copy

    def prepare_city_risk_profile(df: pd.DataFrame) -> pd.DataFrame:
        """
        Extracts a risk profile from the 'city_ccra' column and adds it as a new column 'city_risk_profile'.
        Each risk profile is a dictionary mapping hazards to the maximum normalized risk score.
        """
        df_copy = df.copy()

        def extract_risk_profile(ccra_data):
            risk_profile = {}
            # Ensure the data is a list of dictionaries
            if isinstance(ccra_data, list):
                for entry in ccra_data:
                    hazard = entry.get("hazard")
                    score = entry.get("normalised_risk_score")
                    # Skip entries with missing hazard or score
                    if hazard is None or score is None:
                        continue
                    # Use the maximum score if a hazard appears multiple times
                    risk_profile[hazard] = max(risk_profile.get(hazard, 0), score)
            return risk_profile

        if "city_ccra" in df_copy.columns:
            df_copy["city_risk_profile"] = df_copy["city_ccra"].apply(
                extract_risk_profile
            )
        else:
            print("Warning: 'city_ccra' column not found in DataFrame.")

        return df_copy

    def match_action_hazards_with_city_risks(df: pd.DataFrame) -> pd.DataFrame:
        """
        Matches each action's hazard list with the city's risk profile.
        Creates two new columns:
        - 'actionA_risk_scores': List of risk scores for hazards in 'actionA_Hazard' that are present in the city's risk profile.
        - 'actionB_risk_scores': List of risk scores for hazards in 'actionB_Hazard' that are present in the city's risk profile.
        """
        df_copy = df.copy()

        def get_matching_risk_scores(action_hazards, city_risk_profile):
            # Validate that we have the correct types
            if not isinstance(action_hazards, list) or not isinstance(
                city_risk_profile, dict
            ):
                return []
            return [
                city_risk_profile[hazard]
                for hazard in action_hazards
                if hazard in city_risk_profile
            ]

        # Process Action A hazards
        if "actionA_Hazard" in df_copy.columns:
            df_copy["actionA_risk_scores"] = df_copy.apply(
                lambda row: get_matching_risk_scores(
                    row.get("actionA_Hazard", []), row.get("city_risk_profile", {})
                ),
                axis=1,
            )
        else:
            print("Warning: 'actionA_Hazard' column not found.")

        # Process Action B hazards
        if "actionB_Hazard" in df_copy.columns:
            df_copy["actionB_risk_scores"] = df_copy.apply(
                lambda row: get_matching_risk_scores(
                    row.get("actionB_Hazard", []), row.get("city_risk_profile", {})
                ),
                axis=1,
            )
        else:
            print("Warning: 'actionB_Hazard' column not found.")

        return df_copy

    def create_weighted_comparative_feature(df: pd.DataFrame) -> pd.DataFrame:
        """
        Computes a weighted total risk score for each action by:
        - Summing the matched risk scores from the corresponding action.
        - Multiplying the sum by the action's adaptation effectiveness.

        Creates the following new columns:
        - 'weighted_actionA_risk_total'
        - 'weighted_actionB_risk_total'
        - 'weighted_risk_score_diff': The difference (Action A total minus Action B total)

        A positive 'weighted_risk_score_diff' indicates that Action A is better aligned with the city's risks.
        """
        df_copy = df.copy()

        def sum_scores(scores):
            if isinstance(scores, list):
                return sum(scores)
            return 0

        # Calculate weighted risk total for Action A and Action B.
        # The adaptation effectiveness columns are assumed to be numeric (values between 1 and 3).
        df_copy["weighted_actionA_risk_total"] = (
            df_copy["actionA_risk_scores"].apply(sum_scores)
            * df_copy["actionA_AdaptationEffectiveness"]
        )
        df_copy["weighted_actionB_risk_total"] = (
            df_copy["actionB_risk_scores"].apply(sum_scores)
            * df_copy["actionB_AdaptationEffectiveness"]
        )

        # Compute the comparative feature.
        df_copy["weighted_risk_score_diff"] = (
            df_copy["weighted_actionA_risk_total"]
            - df_copy["weighted_actionB_risk_total"]
        )

        return df_copy

    def process_ccra_hazards_adaptation_effectiveness(df: pd.DataFrame) -> pd.DataFrame:
        """
        Processes the input DataFrame through the following pipeline:
        1. Extract the city's risk profile from 'city_ccra'.
        2. Match each action's hazard list with the city's risk profile.
        3. Compute a weighted comparative feature based on the matched risk scores and adaptation effectiveness.

        Returns the modified DataFrame with new feature columns added.
        """
        df_processed = df.copy()
        df_processed = prepare_city_risk_profile(df_processed)
        df_processed = match_action_hazards_with_city_risks(df_processed)
        df_processed = create_weighted_comparative_feature(df_processed)

        columns_to_drop = [
            "actionA_AdaptationEffectiveness",
            "actionB_AdaptationEffectiveness",
            "actionA_risk_scores",
            "actionB_risk_scores",
            "city_risk_profile",
            "city_ccra",
            "actionA_Hazard",
            "actionB_Hazard",
            "weighted_actionA_risk_total",
            "weighted_actionB_risk_total",
        ]
        df_processed.drop(columns=columns_to_drop, inplace=True)
        return df_processed

    def prepare_co_benefits_data(df) -> pd.DataFrame:

        # Create local copy
        df_copy = df.copy()

        # Extract all unique CoBenefits keys
        co_benefits_keys = [
            "air_quality",
            "water_quality",
            "habitat",
            "cost_of_living",
            "housing",
            "mobility",
            "stakeholder_engagement",
        ]

        # Compute differences between Action A and Action B directly
        for key in co_benefits_keys:
            df_copy[f"CoBenefits_Diff_{key}"] = df_copy.apply(
                lambda row: (
                    (
                        row["actionA_CoBenefits"].get(key, 0)
                        - row["actionB_CoBenefits"].get(key, 0)
                    )
                    if isinstance(row["actionA_CoBenefits"], dict)
                    and isinstance(row["actionB_CoBenefits"], dict)
                    else 0
                ),
                axis=1,
            )

        # Drop the original CoBenefits dictionary columns
        df_copy.drop(columns=["actionA_CoBenefits", "actionB_CoBenefits"], inplace=True)

        return df_copy

    def prepare_biome_data(df) -> pd.DataFrame:

        # Create local copy
        df_copy = df.copy()

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
            df_copy[f"biome_{biome}"] = (df_copy["city_biome"] == biome).astype(int)

        # Drop the original categorical column
        df_copy.drop(columns=["city_biome"], inplace=True)

        return df_copy

    def prepare_numerical_data(df: pd.DataFrame, cols_to_scale: list) -> pd.DataFrame:
        """
        Scales only the specified numerical columns in the DataFrame.

        Parameters:
            df (pd.DataFrame): The input DataFrame.
            cols_to_scale (list): List of column names to scale.

        Returns:
            pd.DataFrame: The DataFrame with selected columns scaled.
        """
        # Create a copy to avoid modifying the original DataFrame
        df_transformed = df.copy()

        # Ensure all columns in cols_to_scale exist in the DataFrame
        valid_cols = [col for col in cols_to_scale if col in df.columns]

        if not valid_cols:
            raise ValueError("None of the specified columns exist in the DataFrame.")

        # Scale the selected columns
        df_transformed[valid_cols] = scaler.transform(df_transformed[valid_cols])

        return df_transformed

    def prepare_final_features(df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare the final features for the ML model by applying all the necessary transformations.

        Parameters:
            df (pd.DataFrame): The input DataFrame.

        Returns:
            pd.DataFrame: The DataFrame with final features.
        """
        # Create local copy
        df_copy = df.copy()

        # Remove columns ActionA and ActionB
        df_copy.drop(columns=["ActionA", "ActionB"], inplace=True)

        return df_copy

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

    # Prepare the data for ML comparison (feature engineering)
    df_transformed = prepare_emission_reduction_data(df)
    df_transformed = prepare_action_type_data(df_transformed)
    df_transformed = prepare_cost_investment_needed_data(df_transformed)
    df_transformed = prepare_timeline_data(df_transformed)
    df_transformed = prepare_adaptation_effectiveness_data(df_transformed)
    df_transformed = process_ccra_hazards_adaptation_effectiveness(df_transformed)
    df_transformed = prepare_co_benefits_data(df_transformed)
    df_transformed = prepare_biome_data(df_transformed)

    # Scale numerical columns
    df_transformed = prepare_numerical_data(
        df_transformed,
        [
            "city_populationSize",
            "city_populationDensity",
            "city_elevation",
            "EmissionReduction_Diff_stationary_energy",
            "EmissionReduction_Diff_transportation",
            "EmissionReduction_Diff_waste",
            "EmissionReduction_Diff_ippu",
            "EmissionReduction_Diff_afolu",
            "CostInvestmentNeeded_Diff",
            "TimelineForImplementation_Diff",
            "weighted_risk_score_diff",
            "CoBenefits_Diff_air_quality",
            "CoBenefits_Diff_water_quality",
            "CoBenefits_Diff_habitat",
            "CoBenefits_Diff_cost_of_living",
            "CoBenefits_Diff_housing",
            "CoBenefits_Diff_mobility",
            "CoBenefits_Diff_stakeholder_engagement",
        ],
    )
    # print(df_transformed.T)

    # Final feature cleanup
    df_transformed = prepare_final_features(df_transformed)

    # Make a prediction with the model
    prediction = predict_xgb(df_transformed)

    return prediction


if __name__ == "__main__":
    # Calling it with test data
    city_data = {
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
        "industrialProcessEmissions": 1720470000,
        "landUseEmissions": 72418882.0,
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

    actionA_data = {
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
    }

    actionB_data = {
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
    }

    result = ml_compare(city_data, actionA_data, actionB_data)
    print(f"Preferred Action: {result}")
