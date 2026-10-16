#!/bin/sh
# Runs once on first DB start: CC and CA each get an isolated role/database.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE citycatalyst LOGIN PASSWORD '${CC_DB_PASSWORD}';
CREATE DATABASE citycatalyst OWNER citycatalyst;
CREATE DATABASE cnb OWNER ${POSTGRES_USER};
SQL
