export const hasAccessToCity = async (cityId: string, userId: string) => {
  // TODO to be implemented
  // return true for collaborators, project admins, and org admins
};

export const hasProjectLevelAccess = async (
  projectId: string,
  userId: string,
) => {
  // TODO to be implemented
  // return true for project admins and org admins
};

export const hasOrgLevelAccess = async (orgId: string, userId: string) => {
  // TODO to be implemented
  // return true for org admins
};

export const hasAccessToCityCatalyst = async (userId: string) => {
  // TODO to be implemented
  // return true for anyone who has some ties to an org
};
