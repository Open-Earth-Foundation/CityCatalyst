# Permission Service Migration Checklist

## Overview
This checklist covers migrating from the scattered permission checking patterns to the centralized PermissionService. Each item includes the current pattern, new pattern, affected files, and priority level.

## 🔥 Critical Priority (Block all other work until complete)

### 1. Replace UserService.findUserInventory - API Routes
**Pattern**: Access check + resource loading combined  
**Impact**: 15+ API routes, core functionality

**Current**:
```typescript
const inventory = await UserService.findUserInventory(inventoryId, session);
```

**New**:
```typescript
const { resource: inventory } = await PermissionService.canEditInventory(session, inventoryId);
```

**Files to Update**:
- ✅ `app/src/app/api/v0/inventory/[inventory]/activity-value/[id]/route.ts` (3 occurrences) - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/activity-value/route.ts` (3 occurrences) - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/route.ts` (2 occurrences) - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/results/[sectorName]/route.ts` - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/results/emissions-forecast/route.ts` - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/results/route.ts` - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/value/[subcategory]/route.ts` (2 occurrences) - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/value/route.ts` - **COMPLETED**
- ✅ `app/src/app/api/v0/inventory/[inventory]/value/subsector/[subsector]/route.ts` (3 occurrences) - **COMPLETED**
- ✅ `app/src/app/api/v0/datasource/[inventoryId]/datasource/[datasourceId]/route.ts` (2 occurrences) - **COMPLETED**

### 2. Replace UserService.findUserInventory - Services
**Pattern**: Service-to-service permission checking

**Files to Update**:
- ✅ `app/src/backend/InventoryService.ts` - **COMPLETED**
- ✅ `app/src/backend/InventoryDownloadService.ts` - **COMPLETED**

### 3. Replace Manual Permission Checks in City Creation
**Pattern**: Manual role checking for city creation

**Current**:
```typescript
const isOrgAdmin = await hasOrgOwnerLevelAccess(organizationId, session.user.id);
const isProjectAdmin = await hasProjectOwnerLevelAccess(projectId, session.user.id);
if (!isOrgAdmin && !isProjectAdmin) {
  throw new createHttpError.Forbidden("Cannot create city");
}
```

**New**:
```typescript
const { resource: project } = await PermissionService.canCreateCity(session, projectId);
```

**Files to Update**:
- ✅ `app/src/app/api/v0/city/route.ts` - **COMPLETED**
- ✅ `app/src/app/api/v0/city/[city]/inventory/route.ts` - **COMPLETED**

## 🔴 High Priority 

### 4. Replace UserService Admin Validation
**Pattern**: System admin validation

**Current**:
```typescript
UserService.validateIsAdmin(session);
// or
UserService.ensureIsAdmin(session);
```

**New**:
```typescript
if (!session?.user || session.user.role !== Roles.Admin) {
  throw new createHttpError.Forbidden("System admin access required");
}
```

**Files to Update**:
- `app/src/app/api/v0/organizations/route.ts` (2 occurrences)
- `app/src/app/api/v0/organizations/[organization]/route.ts` (2 occurrences)
- `app/src/backend/AdminService.ts` (3 occurrences)

### 5. Replace UserService.validateIsAdminOrOrgAdmin
**Pattern**: Admin or organization owner validation

**Current**:
```typescript
await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
```

**New**:
```typescript
await PermissionService.canAccessOrganization(session, organizationId);
```

**Files to Update**:
- `app/src/app/api/v0/organizations/[organization]/invitations/route.ts` (2 occurrences)
- `app/src/app/api/v0/projects/[project]/modules/[module]/access/route.ts`

### 6. Replace Default Inventory Finding
**Pattern**: Finding user's default inventory

**Current**:
```typescript
inventoryId = await UserService.findUserDefaultInventory(session);
```

**New**: This needs a new convenience method in PermissionService:
```typescript
inventoryId = await PermissionService.getUserDefaultInventory(session);
```

**Files to Update**:
- `app/src/app/api/v0/inventory/[inventory]/route.ts`

## 🟡 Medium Priority

### 7. Add Missing Convenience Methods
These are patterns that would benefit from dedicated PermissionService methods:

**Files Needing New Methods**:
- `app/src/app/api/v0/user/invites/route.ts` - Need `canInviteToCity()`
- Multiple chat/assistant routes - Need `canAccessInventoryForChat()`

### 8. Replace Mixed Permission Patterns
**Pattern**: Files that mix different permission approaches

**Files to Standardize**:
- `app/src/backend/UserService.ts` - Internal permission checks (4 occurrences of hasOrgOwnerLevelAccess)
- `app/src/util/api.ts` - Middleware permission checking

### 9. Update Permission Error Handling
**Pattern**: Inconsistent error messages and codes

**Current**: Various custom error messages
**New**: Standardized error codes from `PERMISSION_ERRORS`

**Files to Update**: All files that throw custom permission errors

## 🟢 Low Priority (Nice to have)

### 10. Frontend Permission Checks
**Pattern**: Frontend role checking for UI

**Files to Consider**:
- `app/src/components/navigation-bar.tsx`
- `app/src/app/[lng]/admin/layout.tsx`  
- `app/src/hooks/useAdminGuard.ts`
- `app/src/components/ClientRootLayout/index.tsx`

*Note*: These are UI-level checks and don't need immediate migration as they don't affect security

### 11. Test Files
**Pattern**: Mock session creation in tests

**Files to Eventually Update**:
- All `*.jest.ts` files with `mockAdminSession`

## 🛠️ New Methods Needed

Based on the analysis, we need to add these methods to PermissionService:

### Required Methods:
```typescript
// For default inventory access
static async getUserDefaultInventory(session: AppSession): Promise<string>

// For city invitation permissions  
static async canInviteToCity(session: AppSession, cityId: string): Promise<ResourceAccess>

// For chat/assistant access with read-only option
static async canAccessInventoryReadOnly(session: AppSession, inventoryId: string): Promise<ResourceAccess>
```

## ✅ Completed Updates

### 1. Permission Errors Refactoring
- **Status**: ✅ **COMPLETED**
- **File**: `app/src/util/permission-errors.ts`
- **Changes**:
  - ✅ Removed action-based error codes (EDIT_INVENTORY, etc.)
  - ✅ Added resource-level error codes (CANNOT_ACCESS_INVENTORY, etc.)
  - ✅ Organized by resource hierarchy (Organization → Project → City → Inventory)
  - ✅ Added `PermissionErrorHelpers` for common scenarios
  - ✅ Updated PermissionService to use new error codes
  - ✅ Maintained backwards compatibility

### 2. Modular PermissionService Architecture
- **Status**: ✅ **COMPLETED**
- **Files**: 
  - `app/src/backend/permissions/PermissionService.ts`
  - `app/src/backend/permissions/PermissionTypes.ts`
  - `app/src/backend/permissions/PermissionResolver.ts`
  - `app/src/backend/permissions/RoleChecker.ts`
  - `app/src/backend/permissions/ResourceLoader.ts`
  - `app/src/backend/permissions/index.ts`

### 3. API Route Migrations (In Progress)

#### ✅ COMPLETED Routes:

**`app/src/app/api/v0/inventory/[inventory]/activity-value/route.ts`**
- **Migration**: `UserService.findUserInventory()` → `PermissionService.canEditInventory()`
- **Changes**:
  - ✅ **POST**: Access check only - `await PermissionService.canEditInventory(session, params.inventory);`
  - ✅ **GET**: Access check + resource loading - `const { resource: inventory } = await PermissionService.canEditInventory(session, params.inventory);`
  - ✅ **DELETE**: Access check + resource loading - `const { resource: inventory } = await PermissionService.canEditInventory(session, params.inventory);`

**`app/src/app/api/v0/inventory/[inventory]/activity-value/[id]/route.ts`**
- **Migration**: `UserService.findUserInventory()` → `PermissionService.canEditInventory()`
- **Changes**:
  - ✅ **PATCH**: Access check only - `await PermissionService.canEditInventory(session, params.inventory);`
  - ✅ **DELETE**: Access check only - `await PermissionService.canEditInventory(session, params.inventory);`
  - ✅ **GET**: Access check only - `await PermissionService.canEditInventory(session, params.inventory);`

### Migration Pattern Examples:

**Old Pattern:**
```typescript
// Access check + resource loading
const inventory = await UserService.findUserInventory(inventoryId, session);

// Access check only (resource not needed)
await UserService.findUserInventory(params.inventory, session);
```

**New Pattern:**
```typescript
// Access check + resource loading
const { resource: inventory } = await PermissionService.canEditInventory(session, inventoryId);

// Access check only (resource not needed)
await PermissionService.canEditInventory(session, params.inventory);
```

### Error Helper Usage:
```typescript
// Instead of: createPermissionError(PERMISSION_ERRORS.CANNOT_EDIT_INVENTORY)
throw PermissionErrorHelpers.inventoryAccess(inventoryId);

// Instead of: createPermissionError(PERMISSION_ERRORS.CANNOT_ACCESS_CITY) 
throw PermissionErrorHelpers.cityAccess(cityId);

// Role-specific errors
throw PermissionErrorHelpers.roleRequired('ORG_ADMIN');
```

## 📋 Migration Steps

### Phase 1: Critical API Routes (Week 1)
1. ✅ Complete PermissionService implementation
2. ⏳ Start with inventory access routes (highest usage)
3. ⏳ Replace city creation routes
4. ⏳ Test each route individually

### Phase 2: Service Layer (Week 1-2)  
1. ⏳ Update InventoryService and InventoryDownloadService
2. ⏳ Update AdminService
3. ⏳ Add missing convenience methods

### Phase 3: Organization Management (Week 2)
1. ⏳ Replace validateIsAdmin calls
2. ⏳ Replace validateIsAdminOrOrgAdmin calls
3. ⏳ Standardize organization permission patterns

### Phase 4: Polish & Testing (Week 3)
1. ⏳ Add comprehensive tests for PermissionService
2. ⏳ Update error handling consistency  
3. ⏳ Performance optimization if needed
4. ⏳ Documentation updates

## 🧪 Testing Strategy

### Unit Tests Required:
- [ ] PermissionService core methods
- [ ] Each role level (ORG_ADMIN, PROJECT_ADMIN, COLLABORATOR)
- [ ] Context resolution (org from project/city/inventory)
- [ ] Error conditions and edge cases

### Integration Tests Required:
- [ ] API routes with different role combinations
- [ ] Cross-organization access attempts (should fail)
- [ ] Invalid context scenarios

## ⚠️ Migration Risks & Mitigations

### High Risk:
1. **Breaking existing functionality** → Migrate one route at a time, test thoroughly
2. **Performance degradation** → Monitor database queries, optimize if needed
3. **Permission bypass** → Code review every change, security testing

### Medium Risk:
1. **Inconsistent error messages** → Update frontend error handling
2. **Test failures** → Update mock data and test patterns

### Low Risk:
1. **Developer confusion** → Provide migration examples and documentation

## 📊 Progress Tracking

### Files Updated: 14 / 45
### API Routes: 12 / 15  
### Service Methods: 2 / 5
### Admin Validations: 0 / 7

## 🎯 Success Criteria

- [ ] All UserService permission methods replaced
- [ ] All manual role checking replaced  
- [ ] Consistent error handling across all routes
- [ ] No regression in existing functionality
- [ ] All tests passing
- [ ] Documentation updated

---

## 🚀 Next Recommended Actions

Based on current progress, here are the next highest-impact migration targets:

### Immediate Next (High Value):
1. **`app/src/app/api/v0/inventory/[inventory]/route.ts`** - Core inventory CRUD operations
2. **`app/src/app/api/v0/inventory/[inventory]/value/[subcategory]/route.ts`** - Inventory value management
3. **`app/src/app/api/v0/inventory/[inventory]/results/route.ts`** - Results viewing (read-only pattern)

### Patterns to Test:
- **Mixed read/write operations** in inventory route
- **Default inventory resolution** pattern
- **Read-only access** patterns in results routes

### Expected Benefits After Next 3 Files:
- ✅ Core inventory operations secured
- ✅ Validation of resource loading patterns
- ✅ Read-only vs edit permission patterns tested
- ✅ ~40% of critical API routes migrated

**Recommended Starting Point**: Continue with `app/src/app/api/v0/inventory/[inventory]/route.ts` as it has the most diverse usage patterns and will validate our approach.