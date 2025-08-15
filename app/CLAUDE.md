# Bash commands
- npm run build: Build the project
- npm run typecheck: Run the typechecker
- npm run dev: Start the development server
- npm run e2e:test run intergration tests
- For instructions you're not sure of, check the package.json file.


# Code style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')

# Workflow
- Be sure to typecheck when you’re done making a series of code changes
- Prefer running single tests, and not the whole test suite, for performance

# Commit style
- Create all commits with the structure
- [work type]: (project name) [issue number] [short description, do not mention claude]
- work type: Feat for features, fix for bug fixes, 
- issue number: gotten from branch name
- project name: always ask me before you make a commit. 