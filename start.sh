
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

# Set required environment variables for production
export NEXT_PUBLIC_SUPPORT_EMAILS=${NEXT_PUBLIC_SUPPORT_EMAILS:-"info@openearth.org,greta@openearth.org"}
export NEXT_PUBLIC_OPENCLIMATE_API_URL=${NEXT_PUBLIC_OPENCLIMATE_API_URL:-"https://openclimate.openearth.dev"}
export NEXT_PUBLIC_FEATURE_FLAGS=${NEXT_PUBLIC_FEATURE_FLAGS:-""}

echo "🚀 Starting application on port $PORT..."
echo "📧 Support emails: $NEXT_PUBLIC_SUPPORT_EMAILS"
echo "🌍 OpenClimate API: $NEXT_PUBLIC_OPENCLIMATE_API_URL"
npm start
