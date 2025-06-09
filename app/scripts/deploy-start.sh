#!/bin/bash
set -e

echo "Starting CityCatalyst deployment..."
export NODE_ENV=production
export PORT=${PORT:-3000}

# Check if .next directory exists
if [ ! -d ".next" ]; then
    echo "Error: .next build directory not found"
    exit 1
fi

echo "Starting Next.js application on port $PORT..."
exec npm start