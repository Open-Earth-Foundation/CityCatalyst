# Roles and Permissions System

## Overview
This document describes the roles and permissions system for the greenhouse gas inventory (GHGI) platform, including the organizational hierarchy and access control mechanisms.

## Organizational Hierarchy

The system follows a 4-level hierarchy:
```
Organization → Project → City → Inventory
```

## Role Types and Definitions

### User Roles (Global Level)
From `app/src/models/User.ts:186` and `app/src/util/types.ts:221-224`:
```typescript
enum Roles {
  User = "user",
  Admin = "admin"
}
```
- **User**: Regular platform users
- **Admin**: System administrators with platform-wide access

### Organization Roles
From `app/src/util/types.ts:240-244` and `app/src/backend/PermissionService.ts:5`:
```typescript
export enum OrganizationRole {
  COLLABORATOR = "collaborator",
  ADMIN = "admin", 
  ORG_ADMIN = "org_admin"
}

export type UserRole = 'ORG_ADMIN' | 'PROJECT_ADMIN' | 'COLLABORATOR' | 'NO_ACCESS';
```

## Role Hierarchy and Permissions

### 1. ORG_ADMIN (Organization Administrator)
- **Database Table**: `OrganizationAdmin` (app/src/models/OrganizationAdmin.ts:22)
- **Scope**: Full access across the entire organization
- **Permissions** (from `app/src/backend/PermissionService.ts:134-142`):
  - ✅ CREATE_CITY
  - ✅ CREATE_INVENTORY
  - ✅ EDIT_INVENTORY
  - ✅ DELETE_CITY
  - ✅ VIEW_ORGANIZATION (full organization access)
  - ✅ MANAGE_USERS
  - ✅ MANAGE_PROJECTS

**Key Capabilities**:
- Manage all users within the organization
- Create, modify, and delete projects
- Access all cities and inventories across all projects
- Organization-wide settings and configuration
- User role assignment and invitation management

### 2. PROJECT_ADMIN (Project Administrator)
- **Database Table**: `ProjectAdmin` (app/src/models/ProjectAdmin.ts:23)
- **Scope**: Limited to assigned projects within the organization
- **Permissions**:
  - ✅ CREATE_CITY (within their projects)
  - ✅ CREATE_INVENTORY (within their projects)
  - ✅ EDIT_INVENTORY (within their projects)
  - ✅ VIEW_ORGANIZATION (limited to their project scope)
  - ❌ DELETE_CITY (ORG_ADMIN only)
  - ❌ MANAGE_USERS (ORG_ADMIN only)
  - ❌ MANAGE_PROJECTS (ORG_ADMIN only)

**Key Capabilities**:
- Create and manage cities within their assigned projects
- Create and manage inventories within their project cities
- Invite collaborators to cities within their projects
- View project-level analytics and reports

### 3. COLLABORATOR
- **Database Table**: `CityUser` (app/src/models/CityUser.ts:22)
- **Scope**: Limited to specific cities they've been explicitly assigned to
- **Permissions**:
  - ✅ EDIT_INVENTORY (only for assigned cities)
  - ✅ VIEW_CITY (only assigned cities)
  - ❌ VIEW_ORGANIZATION (cannot view organization-wide data)
  - ❌ CREATE_CITY
  - ❌ CREATE_INVENTORY
  - ❌ DELETE_CITY
  - ❌ MANAGE_USERS
  - ❌ MANAGE_PROJECTS

**Key Capabilities**:
- Edit inventory data for cities they've been assigned to
- View city-specific data and analytics
- Upload and manage data files for their assigned cities
- **Important**: Cannot view other cities, projects, or organization-wide information

### 4. NO_ACCESS
- **Default state**: Users with no explicit role assignments
- **Permissions**: None - all actions denied

## Permission Resolution Logic

### Context-Based Permission Checking
From `app/src/backend/PermissionService.ts:26-44`:

```typescript
static async checkPermission(
  userId: string,
  action: PermissionAction,
  context: PermissionContext
): Promise<boolean> {
  // Get organization context - REQUIRED for all permissions
  const orgId = context.organizationId || 
                await this.getOrgFromProject(context.projectId) ||
                await this.getOrgFromCity(context.cityId);
  
  if (!orgId) {
    return false; // No organization context means no access
  }

  // Get user's highest role in this specific organization
  const userRole = await this.getUserRoleInOrganization(userId, orgId);
  
  // Check if user has permission for this action
  return this.hasPermissionForAction(userRole, action);
}
```

### Role Resolution Priority
From `app/src/backend/PermissionService.ts:50-62`:

1. **ORG_ADMIN** (highest priority) - checked via `OrganizationAdmin` table
2. **PROJECT_ADMIN** - checked via `ProjectAdmin` table for any project in the organization
3. **COLLABORATOR** - checked via `CityUser` table for any city in organization's projects
4. **NO_ACCESS** - default if no roles found

## Permission Enforcement by Hierarchy Level

### Organization Level
- **ORG_ADMINs**: Complete control over organization
- **Access Control**: `OrganizationAdmin` table links users to organizations
- **Operations**:
  - Create/delete/modify projects
  - Manage all users and their roles
  - Access all organizational data and analytics
  - Configure organization settings and branding

### Project Level
- **PROJECT_ADMINs**: Manage resources within assigned projects
- **Access Control**: `ProjectAdmin` table links users to specific projects
- **Scope Validation**: From `app/src/backend/PermissionService.ts:67-77`
- **Operations**:
  - Create cities within their projects
  - Create inventories for cities in their projects
  - Invite collaborators to project cities
  - View project-wide analytics

### City Level
- **COLLABORATORs**: City-specific access only
- **Access Control**: `CityUser` table links users to specific cities
- **Strict Scope**: From `app/src/backend/PermissionService.ts:83-97`
- **Operations**:
  - Edit inventories for assigned cities only
  - View data for assigned cities only
  - Upload files for assigned cities
  - **Cannot**: View other cities, projects, or organization data

### Inventory Level
- **No Direct Roles**: Permissions inherited from city/project/organization access
- **Access Pattern**: Inventory access determined by city access rights
- **Operations**: Create, edit, delete based on higher-level role permissions

## Security Features

### 1. Organization-Centric Security
- **Mandatory Context**: All permissions require organization context (`app/src/backend/PermissionService.ts:32-37`)
- **Multi-Organization Support**: Users can have different roles across organizations
- **Isolation**: Complete separation between organizations

### 2. Hierarchical Context Resolution
- **Upward Traversal**: System finds organization context by traversing hierarchy
- **Resolution Path**: inventory → city → project → organization (`app/src/backend/PermissionService.ts:103-127`)
- **Fail-Safe**: No context = no access

### 3. Permission Matrix
Defined in `app/src/backend/PermissionService.ts:134-142`:

| Action | ORG_ADMIN | PROJECT_ADMIN | COLLABORATOR |
|--------|-----------|---------------|-------------|
| CREATE_CITY | ✅ | ✅ | ❌ |
| CREATE_INVENTORY | ✅ | ✅ | ❌ |
| EDIT_INVENTORY | ✅ | ✅ | ✅ (assigned cities only) |
| DELETE_CITY | ✅ | ❌ | ❌ |
| VIEW_ORGANIZATION | ✅ | ✅ (project scope) | ❌ |
| MANAGE_USERS | ✅ | ❌ | ❌ |
| MANAGE_PROJECTS | ✅ | ❌ | ❌ |

### 4. Error Handling
Standardized permission errors in `app/src/util/permission-errors.ts:4-29`:
- Clear error codes for different permission violations
- User-friendly error messages
- Consistent HTTP status codes (403 for permissions, 404 for not found)

## Database Schema

### Core Permission Tables
- **OrganizationAdmin**: `organizationAdminId`, `organizationId`, `userId`
- **ProjectAdmin**: `projectAdminId`, `projectId`, `userId`
- **CityUser**: `cityUserId`, `cityId`, `userId`

### Hierarchy Tables  
- **Organization**: `organizationId`, `name`, `active`, `contactEmail`
- **Project**: `projectId`, `name`, `organizationId`, `cityCountLimit`
- **City**: `cityId`, `name`, `projectId`, `locode`
- **Inventory**: `inventoryId`, `cityId`, `year`, `inventoryName`

## Key Implementation Files

- **Permission Logic**: `app/src/backend/PermissionService.ts`
- **Role Access**: `app/src/backend/RoleBasedAccessService.ts`
- **Error Handling**: `app/src/util/permission-errors.ts`
- **Type Definitions**: `app/src/util/types.ts`
- **Database Models**: `app/src/models/Organization*.ts`, `app/src/models/Project*.ts`, `app/src/models/City*.ts`

## Important Notes

1. **Collaborator Isolation**: Collaborators can ONLY see cities they've been explicitly assigned to - they cannot view organization-wide or project-wide information.

2. **Organization Context Required**: All permission checks require organization context. Without it, access is automatically denied.

3. **Role Inheritance**: Higher roles inherit all permissions of lower roles, but scope restrictions still apply.

4. **Multi-Organization Users**: A single user can have different roles across different organizations (e.g., ORG_ADMIN in one org, COLLABORATOR in another).

5. **Project Admin Scope**: Project admins can only manage resources within their assigned projects, not organization-wide.