FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install PostgreSQL client for database connectivity testing
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy the llm_config.yaml from the build context (climate-advisor directory)
COPY llm_config.yaml ./llm_config.yaml

# Copy the prompts directory from the build context
COPY ../prompts ./prompts

COPY service/app ./app

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
