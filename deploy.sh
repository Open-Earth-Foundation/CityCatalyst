
#!/bin/bash
set -e

echo "🚀 Starting CityCatalyst deployment..."

# Change to app directory
cd app

echo "📦 Installing production dependencies..."
npm ci --production --no-audit --no-fund

echo "🔨 Building application..."
npm run build

echo "✅ Build completed successfully!"
echo "📁 Build output is in app/.next/"

# Verify build exists
if [ ! -d ".next" ]; then
    echo "❌ Error: Build directory not found!"
    exit 1
fi

echo "🎉 Deployment preparation complete!"
