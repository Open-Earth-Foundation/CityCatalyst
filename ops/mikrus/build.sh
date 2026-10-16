#!/bin/sh
# Called from the uploaded release directory; keep writes running during builds.
set -eu
TAG=${1:?Usage: build.sh TAG}
docker build --progress=plain -f ca/service/Dockerfile -t "citycatalyst-ca:$TAG" ca
docker build --progress=plain -f web/Dockerfile.mikrus -t "citycatalyst-web:$TAG" web
