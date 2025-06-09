
#!/bin/bash
set -e

echo "Starting CityCatalyst deployment..."

# Ensure we're in the correct directory
cd /app

# Set production environment
export NODE_ENV=production

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found in /app"
    exit 1
fi

# Check if .next directory exists
if [ ! -d ".next" ]; then
    echo "Error: .next build directory not found. Build may have failed."
    exit 1
fi

# Start the application
echo "Starting Next.js application..."
exec npm start
