FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install PostgreSQL client for database connectivity testing
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Install uv from the official Astral image
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /uvx /bin/

# Copy uv project metadata and install production dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev

# Copy the llm_config.yaml from the build context (climate-advisor directory)
COPY llm_config.yaml ./llm_config.yaml

# Copy the prompts directory from the build context (climate-advisor directory)
COPY prompts ./prompts

# Copy the service runtime
COPY service ./service

WORKDIR /app/service

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
