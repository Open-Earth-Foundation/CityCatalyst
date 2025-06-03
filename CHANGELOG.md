## [0.49.0] – 2025-06-03

### Added
- **Bulk data download UI**
  Implemented the bulk data download interface in the frontend. (#1442)
- **White-labelling support**
  - White-labeled emails for collaborator access
  - White-labelling applied to city invite emails
  - Added a `primary_color` column to the `theme` table to support custom theming
- **Branded email templates**
  - Created OEF-to-organization email layouts for branded communications
- **Cache & UI enhancements**
  - Clear project cache automatically when a new inventory is added
  - Added “Delete Inventory” modal and “Delete City” modal views
  - Inventory view creation for Org Owner workflows
  - Dynamic AI button repositioning when scrolling
  - Introduced default waste composition values and UI fields
  - French locale support (closes ON-3890)
- **OEF-admin feature**
  Enabled OEF administrators to toggle an organization’s active status
- **Database migrations**
  - Added enum constraint migration for the `User.role` column
  - Added enum constraint migration for the `CityInvite.status` column
  - Added migration to change enum type for `UserFile.fileType` column

### Changed
- **Code cleanups & refactoring** across UI, API, and backend modules
- **Dependencies bumped**
  - **/app**
    - `@react-email/components` 0.0.36 → 0.0.41
    - `pg` & `@types/pg` (updated to latest)
    - `typescript` 5.5.4 → 5.8.3
    - `react-i18next` 15.0.1 → 15.5.2
    - `i18next-browser-languagedetector` (updated to latest)
    - `chakra-react-select` 4.9.1 → 6.1.0
  - **/global-api**
    - `aiohttp` (updated to latest)
    - `uvicorn` 0.34.2 → 0.34.3
    - `mypy` 1.15.0 → 1.16.0
    - `alembic` 1.15.2 → 1.16.1
  - **/app (dev-dependencies)**
    - `start-server-and-test` 2.0.3 → 2.0.12
- **i18n updates**
  Refreshed translations for Spanish, Portuguese, French, and German (multiple commits)
- **Logging improvements**
  - Replaced most `console.*` calls with `logger.*` (more consistent logging)
  - Added extensive logging to the email‐sending function for better observability
- **Docker configuration**
  - Switched to a two-stage Dockerfile to split out dev dependencies
  - Included seeders, migrations, and custom scripts in the Docker build
  - Adjusted test file formats to align with the new container layout
  - Removed dev tagging from the GitHub Action that builds the image
- **Inventory & API behavior**
  - Invalidate data caches on invite acceptance
  - Graceful handling of `null` inventory paths in navigation
  - Realigned timestamp constraints in migrations and models
  - Removed raw SQL queries from migrations (moved to Alembic)
- **Report Results module**
  - Code cleanups and refactored methane‐commitment calculations
- **Emissions structure**
  - Updated database migrations and table structure for emissions reporting
  - Removed outdated raw SQL and aligned with the ORM layer

### Fixed
- **Catalogue timestamps**
  - Corrected the `updatedAt` timestamp logic for `Catalogue`
  - Used the `created` field to populate `Catalogue.createdAt` consistently
- **Docker-related fixes**
  - Rolled back problematic Docker changes
  - Fixed file-naming errors in Docker context
  - Resolved build breakage comments from Korbit
- **CI build issues**
  Addressed multiple CI build failures (linting, missing scripts, type errors)
- **Inventory API validations**
  - Ensured UUID strings are non-null before route processing
  - Prevented `null` strings from propagating into API calls by using defaults (ON-4024)
- **CSV download functionality**
  - Included third-party data in CSV exports (ON-3926)
  - Fixed sector name display and tooltip styling in report results (ON-3939, ON-3931)
  - Corrected methane commitment calculation in CSV mode
- **Emissions factors**
  Corrected transportation emissions factors; added missing waste composition values
- **UI/UX bug fixes**
  - Obstructed unit dropdown in activity modal corrected (ON-3902)
  - Locked-out user issue when deleting the default inventory fixed (ON-3898)
  - Removed extra padding and adjusted styling for data quality tags
  - Updated project name display on the single-drawer view
  - Fixed “count all third-party data” logic in ActivityTab
  - Added missing `useMemo` dependencies in ActivityTab hooks
  - Prevented querying activity values when `subSectorId` is undefined
  - Properly marked `unavailableReason` & `unavailableExplanation` as nullable in the model
  - Hide project link if `PROJECT_OVERVIEW_ENABLED` is not set
  - Resolved type error in `tests/helpers.ts` stopping tests from running
  - Adjusted test naming for Org Invite suite
- **API bug fixes**
  - Assigned `subSectorId` & `sectorId` correctly in `InventoryValue` during POST notation-keys
  - Restored `?.` operator in `CSVDownloadService` for emissionsPerActivity
  - Fixed PR feedback regarding API contracts (ON-3925)
  - Corrected GPC reference number in waste inventory migration (DB issue)
  - Data seeder constraints in initial DB setup fixed
  - Corrected `DataSourceService` import path to restore dev cluster DB server connectivity
  - Redirect logic fixes for MissingInventory and Onboarding flows
- **Translation fixes**
  - Fixed translation of subsector names in Spanish, German, Portuguese, and others
  - Guarded against missing `populationYear` value in translation lookups

### Removed
- Removed raw SQL queries from migration files in favor of Alembic constraints
- Excluded `tsx` from `devDependencies` so it isn’t filtered out in the production Docker image

### Deprecated
- _None in this release._

### Security
- _None in this release._

## [0.47.0-rc.3] - 2025-05-06
### Added
- **Logging**:
  - Added copious logging to the email sending function to improve traceability and debugging.

- **Changelog**:
  - Added a changelog to the repository for better release tracking.

### Changed
- **Version Update**:
  - Updated version to `v0.47.0-rc.3`.

## [0.47.0-rc.2] - 2025-05-06
### Added
- **White Label Support**:
  - Introduced endpoints for managing white-label functionality for organizations, allowing customization of themes and logos.
  - New `Theme` table added to the database to store theme options (`theme_id`, `theme_key`).
  - Admin users can now update the logo and theme for their organizations.

- **New Migrations**:
  - Migration added for `theme_id` column in the `Organization` table.
  - Migration for theme options added to the `Theme` table, with default values like `blue_theme`, `green_theme`, etc.

### Changed
- **Version Bump**: Updated the version to `0.47.0-rc.2` in project files.

- **File Upload Configuration**:
  - Removed S3 file upload configuration from the production environment.
  - Updated workflow to use new S3 credentials for testing environments.

- **UI Enhancements**:
  - Improved the theme management UI, allowing admin users to select a theme (e.g., `blue`, `light_brown`, `dark_orange`).
  - Enhanced logo upload functionality, with better control for updates and deletions.

### Fixed
- **Project List UI**:
  - Fixed issue where the project list became outdated after accepting an organization admin invite.

- **API Fixes**:
  - Removed missing `inventoryId` attribute in the `City` query for bulk downloads, ensuring correct data is returned.
  - Fixed missing attributes affecting inventory management and related API responses.

- **Database Fixes**:
  - Made migration for organization invite timestamp columns optional, using `try/catch` to handle errors.

### Translations
- **Updated Translations**:
  - Added updates for Portuguese (`pt`), Spanish (`es`), and German (`de`) translations to support the new theme options and organizational settings.

### Miscellaneous
- Various small fixes and adjustments to support smooth transitions between the old and new features.
