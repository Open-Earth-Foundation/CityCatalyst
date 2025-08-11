# Permission Migration Status

## ✅ Completed

### Core System
- **PermissionService**: Centralized permission checking with role-based access
- **Permission API**: `/api/v0/user/permissions` endpoint for frontend
- **Frontend Integration**: RTK Query + React hook for UI permission checks
- **Error Handling**: http-errors with structured logging

### Files Migrated (22 total)

#### API Routes (14 files)
- ✅ `inventory/[inventory]/route.ts` - CRUD operations  
- ✅ `inventory/[inventory]/results/*.ts` - Read-only results (3 files)
- ✅ `inventory/[inventory]/value/*.ts` - Value management (3 files) 
- ✅ `inventory/[inventory]/activity-value/*.ts` - Activity values (2 files)
- ✅ `datasource/[inventoryId]/datasource/[datasourceId]/route.ts`
- ✅ `city/route.ts` - City creation
- ✅ `city/[city]/inventory/route.ts` - Inventory creation
- ✅ `user/permissions/route.ts` - Permission checking

#### Services (2 files)
- ✅ `InventoryService.ts` - Inventory data loading
- ✅ `InventoryDownloadService.ts` - Export functionality

#### Frontend (3 files)  
- ✅ `HomePage.tsx` - Add inventory button (collaborator restriction)
- ✅ `ProjectDrawer.tsx` - Add city button (collaborator restriction)
- ✅ `hooks/useUserPermissions.ts` - Permission checking hook

#### Core Files (3 files)
- ✅ `util/permission-errors.ts` - Structured error handling
- ✅ `util/types.ts` - UserRole enum and types
- ✅ `services/api.ts` - RTK Query integration

## Remaining High Priority

### Admin Validation Routes (7 occurrences)
**Pattern**: Replace `UserService.validateIsAdmin()` with direct role check
```typescript
// Current
UserService.validateIsAdmin(session);

// New  
if (session?.user?.role !== Roles.Admin) {
  throw new createHttpError.Forbidden("System admin access required");
}
```

**Files**:
- `api/v0/organizations/route.ts` (2 occurrences)
- `api/v0/organizations/[organization]/route.ts` (2 occurrences) 
- `backend/AdminService.ts` (3 occurrences)

### Organization Admin Validation (2 occurrences)
**Pattern**: Replace `UserService.validateIsAdminOrOrgAdmin()`
```typescript
// Current
await UserService.validateIsAdminOrOrgAdmin(session, organizationId);

// New
await PermissionService.canAccessOrganization(session, organizationId);
```

**Files**:
- `api/v0/organizations/[organization]/invitations/route.ts` (2 occurrences)
- `api/v0/projects/[project]/modules/[module]/access/route.ts`

### Default Inventory Resolution (1 occurrence) 
**Pattern**: Need new PermissionService method
```typescript
// Current
inventoryId = await UserService.findUserDefaultInventory(session);

// New (needs implementation)
inventoryId = await PermissionService.getUserDefaultInventory(session);
```

**Files**:
- `api/v0/inventory/[inventory]/route.ts` (TODO comment exists)

## Future Enhancements


## 📋 Migration Pattern
```typescript
// Check permissions
const { userRole } = useUserPermissions({ cityId, projectId, organizationId });

// Conditional rendering
{userRole !== UserRole.COLLABORATOR && (
  <AdminButton />
)}

// Backend validation  
await PermissionService.canEditInventory(session, inventoryId);
```