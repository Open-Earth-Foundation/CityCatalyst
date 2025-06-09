
# CityCatalyst Deployment Wrapper Guide

## Overview

This guide documents the deployment wrapper system implemented to make CityCatalyst work with Replit's deployment infrastructure while maintaining compatibility with the existing Next.js application structure.

## Problem Statement

CityCatalyst is a complex Next.js application with:
- App directory located in `/app` subdirectory
- Production dependencies and build process in the subdirectory
- Need for deployment on Replit's infrastructure
- Requirements to maintain existing development workflow

Standard Replit deployment expects the application to be in the root directory, but moving the entire app structure would break existing workflows and CI/CD processes.

## Solution: Deployment Wrapper

We implemented a two-script deployment wrapper system that allows Replit to deploy the app from the root while keeping the actual application in the `/app` subdirectory.

## Implementation Details

### 1. Root-Level Package.json
**File: `/package.json`**
```json
{
  "name": "citycatalyst-deployment",
  "version": "1.0.0",
  "scripts": {
    "build": "cd app && npm ci --production --no-audit --no-fund && npm run build",
    "start": "cd app && npm start"
  },
  "dependencies": {}
}
```

**Purpose**: Provides Replit deployment with the expected package.json structure while delegating all operations to the app subdirectory.

### 2. Build Script
**File: `/deploy.sh`**
```bash
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
```

**Purpose**: Handles the build process by changing to the app directory, installing production dependencies, and building the Next.js application.

### 3. Start Script
**File: `/start.sh`**
```bash
#!/bin/bash
set -e

echo "🚀 Starting CityCatalyst production server..."

# Check if we're in app directory or root
if [ -d "app" ]; then
    echo "📁 Changing to app directory..."
    cd app
fi

# Verify build exists
if [ ! -d ".next" ]; then
    echo "❌ Error: No build found! Please run deploy.sh first."
    exit 1
fi

echo "🌟 Starting Next.js server..."
npm start
```

**Purpose**: Starts the production server by changing to the app directory and running the Next.js start command.

### 4. Replit Configuration
**File: `/.replit`** (relevant sections)
```ini
[deployment]
run = ["bash", "start.sh"]
deploymentTarget = "cloudrun"
build = ["bash", "deploy.sh"]
workingDirectory = "."
```

**Purpose**: Configures Replit to use our wrapper scripts for building and running the application.

## Current Issues Being Addressed

Based on the console errors, we're still working on resolving:

1. **PostCSS/Tailwind Processing**: Module parse errors with `@tailwind` directives
2. **Script Injection Errors**: `EvalError: Code generation from strings disallowed`
3. **File Corruption**: Some provider files had mixed content from previous edits

## How the Deployment Wrapper Works

### Development Mode
- Uses the existing `cd app && npm run dev` workflow
- No impact on development processes
- All existing commands work as before

### Deployment Mode
1. Replit calls `deploy.sh` for build process
2. Script changes to `/app` directory
3. Installs production dependencies with `npm ci --production`
4. Builds the Next.js app with `npm run build`
5. Verifies build output exists

### Production Runtime
1. Replit calls `start.sh` to run the application
2. Script changes to `/app` directory
3. Verifies build exists
4. Starts the Next.js production server with `npm start`

## Benefits

1. **Zero Impact on Development**: Development workflow remains unchanged
2. **Deployment Compatibility**: Works with Replit's deployment expectations
3. **CI/CD Preservation**: Existing GitHub Actions and build processes unaffected
4. **Directory Structure Maintained**: App remains in `/app` subdirectory
5. **Production Optimization**: Uses production dependencies and optimized builds

## Recreating This Setup

To implement this deployment wrapper on a new project:

1. **Create root package.json** with delegated scripts
2. **Create deploy.sh** with build logic for your subdirectory
3. **Create start.sh** with startup logic for your subdirectory
4. **Update .replit** to use the wrapper scripts
5. **Set environment variables** for production mode
6. **Test deployment** to ensure scripts work correctly

## Files Modified

- `/package.json` - Created wrapper package.json
- `/deploy.sh` - Created build script
- `/start.sh` - Created startup script
- `/.replit` - Updated deployment configuration
- `/app/next.config.mjs` - Removed problematic script injection
- `/app/postcss.config.cjs` - Fixed PostCSS configuration
- `/app/src/app/providers.tsx` - Fixed corrupted file content

## Environment Variables

The deployment uses these key environment variables:
- `NODE_ENV=production` - Ensures production mode
- `PORT` - Set by Replit for the application port
- Various Next.js specific variables defined in the app configuration

## Testing the Deployment

1. **Local Testing**: Run `bash deploy.sh` then `bash start.sh`
2. **Replit Testing**: Use the Deploy button in Replit interface
3. **Verification**: Check that the app starts and serves correctly

This deployment wrapper approach allows CityCatalyst to maintain its existing structure while being fully compatible with Replit's deployment infrastructure.
