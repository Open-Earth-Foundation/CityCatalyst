# prioritizer_request_mock.json:

This is a mock request for the prioritizer API.
It simulates a request from CityCatalyst frontend containing information provided by the city user via the frontend.

This includes:

- locode (city identifier for the prioritization request)
- population size (potentally updated value from the frontend - will override the value from the city context data API)
- excluded actions (free text field to provide a list of actions to exclude from the prioritization)
- city strategic preference other (free text field to provide a strategic preference for the city)
- city strategic preference sector (list of sectors to prioritize)
- city emissions data (emissions data for the city from CityCatalyst)

# city_api_mock.json:

This is a mock response from the city context data API.
It simulates a response from the city context data API containing information about the city.
The upstream provider is the global-api.

It is being used to fetch basic city context data and also more specific city context data like unemployment rate, renter share, transport logistics employment, electricity access, industry construction employment, median household income, public transport share, poverty rate and home ownership.

The general logic is that this is the baseline and values might be updated by the city user via the frontend request.

# actions_api_mock.json:

This is a mock response from the actions data API.
It simulates a response from the actions data API containing information about the actions.
The upstream provider is the global-api.

It is being used to fetch the list of actions and their associated mitigation and impact data.

# policy_framework_api_mock.json:

This is a mock response from a policy framework API.
It simulates policy signals extracted from plans, targets, and budgets, and links these signals to actions.
The upstream provider is the global-api.

It includes:

- policy signals (national, regional, municipal scopes)
- action to policy signal mapping records

# legal_api_mock.json:

This is a mock response from a legal framework API.
It simulates legal signals that define authority, enablement, restrictions, thresholds, and process requirements.
The upstream provider is the global-api.

It includes:

- legal signals scoped to national, regional, and municipal actors
- action to legal requirement mapping records with operator and strength

# projects_api_mock.json:

This is a mock response from a funded projects API.
It simulates funded projects and supporting evidence used to assess action feasibility, impact, and replicability.
The upstream provider is the global-api.

It includes:

- funded project core records
- project metrics and evidence
- optional supporting project tables (co-benefits, barriers, phases)
- action to funded project evidence links
