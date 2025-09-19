This is the mono repository for High Impact Actions Prioritizer (HIAP).

It contains all the logic for prioritizing actions and creating implementation plans.

There are 2 subfolders:

1. plan_creator_bundle
2. prioritizer

plan_creator_bundle contains all files related specifically to the legacy plan creator and the new plan creator endpoints
prioritizer contains all files related specifically to the prioritizer

## Build Docker and test locally

Run the following commands:

`docker build -t hiap-app .`
`docker run -it --rm -p 8000:8000 --env-file .env hiap-app`

## Testing

To run the tests without the slow ones (recommended) run:
`pytest -m "not slow"`
