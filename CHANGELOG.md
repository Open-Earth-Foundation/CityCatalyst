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
