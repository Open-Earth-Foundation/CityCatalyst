
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

## Compilation Errors Encountered

During the deployment wrapper implementation, we encountered several compilation errors that needed resolution:

### 1. PostCSS/Tailwind CSS Processing Errors
```
Module parse failed: Unexpected character '@' (1:0)
> @tailwind base;
| @tailwind components;
| @tailwind utilities;
```
**Root Cause**: Next.js wasn't properly processing Tailwind CSS directives in production builds.
**Resolution**: Fixed PostCSS configuration and ensured proper Tailwind CSS compilation order.

### 2. Script Injection Errors
```
EvalError: Code generation from strings disallowed for this context
Warning: Prop `dangerouslySetInnerHTML` did not match. Server: "" Client: "window['__ENV'] = {...}"
```
**Root Cause**: Runtime environment variable injection was causing CSP violations and hydration mismatches.
**Resolution**: Moved to build-time environment variables in `next.config.mjs` and removed runtime script injection.

### 3. Provider File Corruption
```
Error: Expected an identifier
╭─[/home/runner/workspace/app/src/app/providers.tsx:1:1]
1 │ tags as requested.
2 │ ```python
```
**Root Cause**: File content was corrupted during previous edits, mixing markdown and TypeScript.
**Resolution**: Restored clean provider file structure with proper TypeScript syntax.

### 4. CSS Module Processing Issues
```
[HMR] Detected local css modules. Reload all css
[Fast Refresh] performing full reload because your application had an unrecoverable error
```
**Root Cause**: Hot Module Replacement conflicts during development mode.
**Resolution**: Ensured proper CSS module configuration and stable development environment.

## Current Status and Solutions

All major compilation errors have been resolved through:

1. **Fixed PostCSS Configuration**: Proper Tailwind CSS processing
2. **Removed Runtime Script Injection**: Switched to build-time environment variables
3. **Restored Clean Files**: Fixed corrupted provider and configuration files
4. **Optimized Build Process**: Streamlined production dependencies installation

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

## Troubleshooting Common Issues

### If You Encounter Tailwind CSS Errors
1. Check `postcss.config.cjs` exists in the app directory
2. Verify Tailwind CSS is installed as a dev dependency
3. Ensure `globals.css` has proper `@tailwind` directives

### If You See Script Injection Errors
1. Remove any runtime environment variable injection
2. Use build-time variables in `next.config.mjs` instead
3. Check for `dangerouslySetInnerHTML` usage in components

### If Build Fails with Module Errors
1. Run `cd app && npm ci --production` to clean install dependencies
2. Check for file corruption in key files like `providers.tsx`
3. Verify Next.js configuration is properly set up

### If Development Mode Has Issues
1. Use `cd app && npm run dev` for development
2. Check that all dependencies are properly installed
3. Ensure database migrations have run successfully

### Debug Commands
```bash
# Test build process
bash deploy.sh

# Test start process
bash start.sh

# Check app directory structure
cd app && ls -la

# Verify dependencies
cd app && npm list --depth=0
```
