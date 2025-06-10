#!/bin/bash
set -e

echo "🚀 Starting CityCatalyst deployment build..."

# Ensure we're in the root directory
if [ ! -d "app" ]; then
    echo "❌ Error: app directory not found!"
    exit 1
fi

# Change to app directory
cd app

echo "📦 Installing dependencies..."
npm ci --no-audit --no-fund

# Install specific dev dependencies needed for build
echo "📦 Installing build-time dependencies..."
npm install --no-save tailwindcss postcss autoprefixer @types/node typescript

echo "🔧 Verifying configuration files..."
# Ensure PostCSS config exists
if [ ! -f "postcss.config.cjs" ]; then
    echo "❌ Error: postcss.config.cjs not found!"
    exit 1
fi

# Ensure Tailwind config exists  
if [ ! -f "tailwind.config.cjs" ]; then
    echo "❌ Error: tailwind.config.cjs not found!"
    exit 1
fi

echo "🔨 Building application..."
# Set NODE_ENV explicitly for build
NODE_ENV=production npm run build:deploy

echo "✅ Build completed successfully!"
echo "📁 Build output located in app/.next/"

# Verify build directory exists
if [ ! -d ".next" ]; then
    echo "❌ Error: Build output directory not found!"
    exit 1
fi

# Verify build manifest exists
if [ ! -f ".next/build-manifest.json" ]; then
    echo "❌ Error: Build manifest not found!"
    exit 1
fi

echo "🎉 Deployment build complete!"