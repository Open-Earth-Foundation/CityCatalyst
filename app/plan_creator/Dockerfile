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

# Convert Windows line endings to Unix and make the run script executable
RUN apt-get update && \
    apt-get install -y dos2unix && \
    dos2unix run.sh && \
    chmod +x run.sh && \
    apt-get remove -y dos2unix && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create output directory
RUN mkdir -p data/output

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["./run.sh"]
