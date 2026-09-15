-- Creates the additional databases needed by other services.
-- The primary database (citycatalyst) is created automatically via
-- POSTGRES_DB in docker-compose.yml.

CREATE USER ccglobal WITH PASSWORD 'development';
CREATE DATABASE ccglobal OWNER ccglobal;
