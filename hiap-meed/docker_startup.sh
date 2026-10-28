#!/usr/bin/env bash
# Build the local hiap-meed image, then start it with persisted logs.
set -e

docker build -t hiap-meed .
docker run -it --rm -p 8000:8000 --env-file .env -v "$PWD/logs:/app/logs" hiap-meed
