
#!/bin/bash
set -e

echo "🌟 Starting CityCatalyst in production mode..."

# Change to app directory
cd app

# Check if build exists
if [ ! -d ".next" ]; then
    echo "❌ Error: No build found. Please run deployment build first."
    exit 1
fi

# Set default port if not provided
export PORT=${PORT:-3000}

echo "🚀 Starting application on port $PORT..."
npm start
