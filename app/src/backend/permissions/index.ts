// Main exports
export { PermissionService } from "./PermissionService";
export { PermissionHelpers } from "./PermissionHelpers";
export type { 
  UserRole, 
  PermissionContext, 
  ResourceAccess, 
  PermissionOptions 
} from "./PermissionTypes";

// Resource type exports
export type {
  CityWithProject,
  InventoryWithRelations,
  ProjectWithOrganization,
  AuthorizedOrganization,
  AuthorizedResource,
  TypedResourceAccess,
} from "./ResourceTypes";

// Module exports (for advanced usage)
export { PermissionResolver } from "./PermissionResolver";
export { RoleChecker } from "./RoleChecker";  
export { ResourceLoader } from "./ResourceLoader";