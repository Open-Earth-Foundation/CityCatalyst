# Start with a minimal Python image
FROM python:3.12-slim

# Install uv from PyPI
RUN pip install --no-cache-dir uv

# Set the working directory
WORKDIR /app

# Copy uv project files and install dependencies with uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"

# Copy the entire app directory (including all subfolders)
COPY app/ ./

# Make the run.sh file executable
RUN chmod +x run.sh

# Create output directory for legacy plan creator file output
RUN mkdir -p plan_creator_legacy/data/output

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["./run.sh"] 