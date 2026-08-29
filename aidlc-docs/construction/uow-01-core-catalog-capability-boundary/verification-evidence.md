# UOW-01 Verification Evidence

**Issue**: CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities  
**Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`  
**Status**: Core Code Generation evidence approved; GHGI environment limitation remains documented for release verification.

## Atomic implementation commits

- `3ed5b1b48` — Core native-input capability registry
- `f727bfb15` — bounded native-input source adapters
- `f7e720cae` — authorized native-input discovery service
- `5adb79af9` — bounded selected native-input reads
- `aa26fb6b7` — Core native-input discovery route
- `07217e41e` — Core selected native-input capability route
- `5f9ada5f3` — Core catalog capability security evidence

## Passing evidence

- CC-737 Core registry, adapter, service, discovery-route, and selected-read
  route suites: **45/45 tests passed**.
- Internal Climate Advisor service-authentication matrix: **8/8 tests passed**.
- Touched CC-737 files: ESLint passed.
- Touched CC-737 files: Prettier check passed.
- HIAP capability regression suite: passed in the combined regression run.

The evidence covers exact Core-owned capability mapping, safe discovery
projection, all populated request-scope dimensions, discovery-only readiness,
selected-only bounded execution, current selected-read revalidation, stable
non-disclosing unavailable errors, result redaction, bounded serialization,
feature/service/session authentication, and auth-matrix registration.

## Environment and baseline limitations

- The existing GHGI inventory capability regression suite could not connect to
  the local PostgreSQL dependency: `SequelizeConnectionError: connect EPERM
  127.0.0.1:5432`. No application change was made to work around this.
- The repository-wide TypeScript check reports the pre-existing missing module
  reference in `.next/dev/types/validator.ts`:
  `src/app/api/v1/city/[city]/meed/rank/route.js`.
- `npm run build` compiles the production bundle, then fails in the TypeScript
  phase with `Could not parse output from TypeScript's --showConfig`.
- `npm run lint` reports unrelated pre-existing repository errors outside the
  CC-737 files. The touched-file ESLint check passes.

These limitations remain open for the Code Generation completion review. No
Climate Advisor/UOW-02 code, migration, storage credential, or raw storage
access was added.
