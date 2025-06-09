
# POC Modules

This directory contains components and utilities specifically for Proof-of-Concept (POC) modules.

## Structure

POC modules are located in `/app/src/app/[lng]/pocs/` and follow this structure:

```
app/src/app/[lng]/pocs/
├── layout.tsx          # Shared layout for all POC modules
├── page.tsx           # POC directory listing
└── [module-name]/
    ├── page.tsx       # Main module page
    ├── components/    # Module-specific components (optional)
    └── utils/         # Module-specific utilities (optional)
```

## Creating a New POC Module

1. Create a new directory under `/app/src/app/[lng]/pocs/[your-module-name]/`
2. Add a `page.tsx` file with your module logic
3. Use the existing auth patterns: `const session = await Auth.getServerSession()`
4. Update the module list in `/app/src/app/[lng]/pocs/page.tsx`

## Guidelines

- Keep modules isolated and self-contained
- Use existing authentication and database patterns
- Follow TypeScript best practices
- Include proper error handling and loading states
- Document any special setup requirements

## Example Access

- POC Directory: `https://citycatalyst.openearth.dev/en/pocs`
- Hello Module: `https://citycatalyst.openearth.dev/en/pocs/hello`
