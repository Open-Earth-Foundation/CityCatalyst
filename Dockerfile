# Start with a minimal Python image
FROM python:3.11-slim
#smallest python option 
# Set the working directory
WORKDIR /app

# Copy only requirements.txt first for better layer caching
COPY requirements.txt .

# Install dependencies without caching pip files
# This will use pre-built wheels when available
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .
COPY vector_stores/ .vector_stores/
# Create output directory
RUN mkdir -p data/output

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]