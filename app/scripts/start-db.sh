#!/bin/bash

DB_USER="${POSTGRES_USER:=citycatalyst}"
DB_PASSWORD="${POSTGRES_PASSWORD:=development}"
DB_NAME="${POSTGRES_DB:=citycatalyst}"
DB_PORT="${POSTGRES_PORT:=5432}"
DB_HOST="${POSTGRES_HOST:=localhost}"

if [[ -z "${SKIP_DOCKER}" ]]; then
	docker run \
		-e POSTGRES_USER=${DB_USER} \
		-e POSTGRES_PASSWORD=${DB_PASSWORD} \
		-e POSTGRES_DB=${DB_NAME} \
		-p "${DB_PORT}":5432 \
		-d postgres \
		postgres -N 1000
fi
