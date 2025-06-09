
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying deployment setup...');

// Check if we're in the right directory
const currentDir = process.cwd();
console.log(`📁 Current directory: ${currentDir}`);

// Check for package.json
const packageJsonPath = path.join(currentDir, 'package.json');
if (fs.existsSync(packageJsonPath)) {
    console.log('✅ package.json found');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`📦 Project: ${packageJson.name} v${packageJson.version}`);
} else {
    console.log('❌ package.json not found');
    process.exit(1);
}

// Check for .next directory
const nextDir = path.join(currentDir, '.next');
if (fs.existsSync(nextDir)) {
    console.log('✅ .next build directory found');
} else {
    console.log('❌ .next build directory not found');
    process.exit(1);
}

// Check for standalone output
const standaloneDir = path.join(currentDir, '.next/standalone');
if (fs.existsSync(standaloneDir)) {
    console.log('✅ Standalone build found');
} else {
    console.log('⚠️  Standalone build not found, using regular build');
}

// Check node_modules
const nodeModulesDir = path.join(currentDir, 'node_modules');
if (fs.existsSync(nodeModulesDir)) {
    console.log('✅ node_modules directory found');
} else {
    console.log('❌ node_modules directory not found');
    process.exit(1);
}

console.log('✨ Deployment verification complete!');
