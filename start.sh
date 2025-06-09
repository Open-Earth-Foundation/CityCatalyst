
#!/bin/bash
set -e

echo "🚀 Starting CityCatalyst production server..."

# Navigate to app directory if not already there
if [ -d "app" ]; then
    echo "📁 Changing to app directory..."
    cd app
fi

# Verify build exists
if [ ! -d ".next" ]; then
    echo "❌ Error: No production build found!"
    echo "Please run the build process first."
    exit 1
fi

# Verify build manifest
if [ ! -f ".next/build-manifest.json" ]; then
    echo "❌ Error: Build manifest missing!"
    exit 1
fi

# Set production environment
export NODE_ENV=production

echo "🌟 Starting Next.js production server..."
npm start
