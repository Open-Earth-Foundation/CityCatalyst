# !/bin/bash

# Make migrations
# Remove the comment if you want to generate migration while creating the build.

# echo Making migrations.
# alembic revision --autogenerate -m "Auto migrations"


# Migrate

echo Starting migration.
alembic upgrade head  &&

if [ $CURRENT_ENVIRONMENT = "dev" ]; then
    # Start local development server
    echo Starting local development server.
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload
else
    # Start Gunicorn processes
    echo Starting Gunicorn.
    gunicorn main:app --bind 0.0.0.0:8001 --workers 2 --worker-class uvicorn.workers.UvicornWorker
fi
