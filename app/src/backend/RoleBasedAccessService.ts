import { db } from "@/models";

export const hasAccessToCity = async (cityId: string, userId: string) => {
  const CityUser = await db.models.CityUser.findOne({
    where: { cityId, userId },
  });
  return !!CityUser;
};

export const hasProjectOwnerLevelAccess = async (
  projectId: string,
  userId: string,
) => {
  const projectAdmin = await db.models.ProjectAdmin.findOne({
    where: { projectId, userId },
  });
  return !!projectAdmin;
};

export const hasOrgOwnerLevelAccess = async (orgId: string, userId: string) => {
  if (!orgId) {
    return false;
  }
  const orgOwner = await db.models.OrganizationAdmin.findOne({
    where: { organizationId: orgId, userId },
  });
  return !!orgOwner;
};
