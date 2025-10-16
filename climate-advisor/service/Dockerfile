FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy requirements from service directory
COPY service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install PostgreSQL client for database connectivity testing
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy the llm_config.yaml from the build context (climate-advisor directory)
COPY llm_config.yaml ./llm_config.yaml

# Copy the prompts directory from the build context (climate-advisor directory)
COPY prompts ./prompts

# Copy application code from service/app
COPY service/app ./app

# Copy migrations for database schema management
COPY service/migrations ./migrations
COPY service/alembic.ini ./alembic.ini

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
