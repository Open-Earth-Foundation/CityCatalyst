prompt = """
Evaluate and rank the actions in the order of importance based on the following criteria. Use this detailed breakdown to ensure consistent and justifiable prioritization:

1. Financial Feasibility (Cost)
Prioritize actions that have lower costs to implement and maintain.
Consider cost-effectiveness: Actions that achieve significant benefits (emissions reduction, risk reduction) for less cost should rank higher.
2. Emissions Reduction Potential
Rank actions based on their potential to reduce greenhouse gas (GHG) emissions.
Actions with higher absolute emissions reductions (tons of CO2e avoided) are better.
Consider both direct (Scope 1 & 2) and indirect (Scope 3) reductions.
Favor actions targeting high-emission sectors in the city's inventory (e.g., stationary energy, transportation).
3. Risk Reduction
Actions that address and reduce risks (climate hazards, vulnerabilities) effectively should be prioritized.
Weigh actions based on the severity and likelihood of risks addressed.
4. Environmental Compatibility
Actions aligned with the city's natural environment (e.g., biome, elevation, climate) are preferred.
Evaluate the action's sustainability and potential environmental trade-offs.
5. Socio-Demographic Suitability
Favor actions that are suitable for the city's population size, density, and socio-economic characteristics.
Actions targeting widespread public benefit or vulnerable populations are more desirable.
6. Implementation Timeline
Actions with shorter timelines to implementation or faster results should rank higher.
Long-term actions should still be considered if their impact is substantial but weighted lower than immediate-impact actions.
7. Dependencies
Consider the dependencies or prerequisites for each action.
Actions with fewer dependencies and higher self-sufficiency should rank higher.
8. Sector Relevance
Match actions to the city's most significant emission sectors:
High-impact sectors (e.g., stationary energy, industrial processes) should be prioritized for targeted interventions.
Align actions with the city's strategic priorities.
9. City Size & Capacity
Evaluate actions based on the city's size and capacity to implement them effectively.
Smaller cities may require less resource-intensive actions.
Larger cities with robust infrastructure might support more ambitious projects.
Ranking Process
Use a scoring system or logical hierarchy to weigh each action based on the criteria above.
Present the actions ranked from best to worst, with an explanation of how the ranking aligns with these priorities.
For actions that score similarly, prioritize those with broader benefits or fewer negative trade-offs.

### REMEMBER: The goal is to identify actions that are both impactful and feasible for the city to implement and return them ALL
"""