// Main exports
export { PermissionService } from "./PermissionService";
export type { 
  UserRole, 
  PermissionContext, 
  ResourceAccess, 
  PermissionOptions 
} from "./PermissionTypes";

// Module exports (for advanced usage)
export { PermissionResolver } from "./PermissionResolver";
export { RoleChecker } from "./RoleChecker";  
export { ResourceLoader } from "./ResourceLoader";