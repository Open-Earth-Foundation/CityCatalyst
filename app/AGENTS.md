# AGENTS.md

## Build, Lint, and Test Commands

- Build: `npm run build`
- Lint: `npm run lint`
- Format: `npm run prettier`
- Run all tests: `npm run test` (Jest + Playwright)
- Run unit/API tests: `npm run jest`
- Run E2E tests: `npm run e2e:test`
- Run a single Jest test: `npx jest --testPathPattern=path/to/testfile.test.js`
- Run a single Playwright test: `npx playwright test tests/path/to/testfile.spec.ts`

## Code Style Guidelines

- Use semicolons (Prettier enforced)
- Use ES module imports (`import ... from ...`)
- Prefer named exports over default unless necessary
- Use TypeScript types and interfaces for all function signatures and props
- Follow Next.js and i18next ESLint rules
- Use PascalCase for components/classes, camelCase for variables/functions
- Handle errors with try/catch and meaningful messages
- Prefer explicit return types for functions
- Organize imports: external first, then internal, then styles/assets
- Avoid unused variables and imports
- Use descriptive names for files, functions, and variables
- Keep functions small and focused
- Document complex logic with comments

_This file is for agentic coding agents. Follow these rules for consistency and reliability._
