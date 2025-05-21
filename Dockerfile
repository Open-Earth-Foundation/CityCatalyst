# Start with a minimal Python image
FROM python:3.13-slim

# Set the working directory
WORKDIR /app

# Copy only the global requirements.txt first for better layer caching
COPY requirements.txt ./requirements.txt

# Install dependencies without caching pip files
RUN pip install --no-cache-dir -r requirements.txt

# Copy the .env file
COPY .env .env

# Copy the entire app directory (including all subfolders)
COPY app/ ./
COPY run.sh ./run.sh

# Make the run.sh file executable
RUN chmod +x run.sh

# Create output directory
RUN mkdir -p plan_creator_legacy/data/output

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["./run.sh"] 