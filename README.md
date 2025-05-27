This is the mono repository for High Impact Actions Prioritizer (HIAP)

It contains all the logic for prioritizing actions and creating implementation plans.

There are 3 subfolders:

1. plan_creator
2. plan_creator_legacy
3. prioritizer

## Build Docker and test locally

Run the following commands:

`docker build -t hiap-app .`
`docker run -it --rm -p 8000:8000 --env-file .env hiap-app`
