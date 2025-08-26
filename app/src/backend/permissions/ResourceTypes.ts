import type { CityAttributes } from "@/models/City";
import type { InventoryAttributes } from "@/models/Inventory";
import type { ProjectAttributes } from "@/models/Project";
import type { OrganizationAttributes } from "@/models/Organization";

export interface CityWithProject extends CityAttributes {
  project: ProjectAttributes;
}

export interface InventoryWithRelations extends InventoryAttributes {
  city: CityWithProject;
}

export interface ProjectWithOrganization extends ProjectAttributes {
  organization: OrganizationAttributes;
}


export interface AuthorizedOrganization extends OrganizationAttributes {}

export type AuthorizedResource = 
  | CityWithProject 
  | InventoryWithRelations 
  | ProjectWithOrganization 
  | AuthorizedOrganization;

  
export interface TypedResourceAccess<T extends AuthorizedResource = AuthorizedResource> {
  hasAccess: boolean;
  userRole: string;
  organizationId: string;
  resource: T;
}