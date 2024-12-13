def return_prompt(action, city):
    """
    Generate the prioritization prompt based on the action and city data.

    Args:
    action (DataFrame): DataFrame containing the top 20 actions to prioritize.
    city (DataFrame): DataFrame containing the city data.

    Returns:
    str: The formatted prioritization prompt.
    """
    # Generate the prioritization prompt
    prompt = f"""
            You are a climate action expert, tasked to prioritize and recommend the top 20 actions for a city based on the following guidelines:
            
            ### Guidelines for Action Prioritization:
            1. **Cost-effectiveness:** Actions with lower costs and high benefits should rank higher.
            2. **Emissions Reduction:** Actions that achieve significant greenhouse gas (GHG) emissions reduction should rank higher, especially those targeting the city's largest emission sectors.
            3. **Risk Reduction:** Prioritize actions that address climate hazards and reduce risks for the city effectively.
            4. **Environmental Compatibility:** Actions that align with the city's environment, such as biome and climate, should be preferred.
            5. **Socio-Demographic Suitability:** Actions should match the population size, density, and socio-economic context of the city.
            6. **Implementation Timeline:** Actions with shorter implementation timelines or faster impact should rank higher.
            7. **Dependencies:** Actions with fewer dependencies or preconditions should be prioritized.
            8. **Sector Relevance:** Actions targeting high-emission or priority sectors for the city should rank higher.
            9. **City Size and Capacity:** Actions should be suitable for the city's capacity and resources to implement.

            ### Instructions:
            - Based on the rules, evaluate the top 20 actions provided.
            - Consider both qualitative and quantitative aspects of the actions.
            - Rank all 20 actions.
            - Provide a detailed explanation for why each action was prioritized.

            ### Action Data (Top 20 Actions):
            {action}

            ### City Data:
            {city}

            RETURN ALL ACTIONS RANKED BY PRIORITY.
            """
    return prompt