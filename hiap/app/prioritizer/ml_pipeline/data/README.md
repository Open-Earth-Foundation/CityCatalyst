# Content of this folder

The folders labled `input` contain the raw inputs of the experts (labelled comparisons)

- `25_02_input_old` contains an old batch of comparisons
- `input_old` contains an old batch of comparisons
- `input` contains all the newest comparisons

The folder labeld `references` contains the actions lists and the city data used for the expert comparisons

- `city_data.json` contains the city data used in the climate action labeller tool
- `merged.json` contains the original list with all actions that the comparison was made against
- `merged_main_hazards.json` is the list of actions with just one main hazard. This was created for a test and not further used
- `merged_individual_adaptation_effectiveness.json` contains the list of actions used for the model training


Note: 
- The original comparison was against `merged.json`
- The actual training was against `merged_individual_adaptation_effectiveness.json`

