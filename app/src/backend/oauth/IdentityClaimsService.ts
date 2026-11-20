import createHttpError from "http-errors";
import { db } from "@/models";

/**
 * Claims that identify a user, for the id_token and the userinfo endpoint.
 *
 * `sub` is the CityCatalyst user id. It stays the same when authentication
 * moves to its own service, so existing foreign keys keep working.
 *
 * Deliberately small. It carries no role or permission: those are decided from
 * `sub` inside CityCatalyst (PermissionService), never from a token.
 *
 * `email_verified` is not included. CityCatalyst keeps no record of whether an
 * email address was verified, and a claim that guessed would be worse than none.
 */
export interface IdentityClaims {
  sub: string;
  email?: string;
  name?: string;
  /** Organizations the user belongs to when the token is issued. May be stale. */
  org_ids: string[];
}

export default class IdentityClaimsService {
  /** Profile claims for a user. Used by the userinfo endpoint. */
  public static async forUser(userId: string): Promise<IdentityClaims> {
    const user = await db.models.User.findOne({ where: { userId } });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    const claims: IdentityClaims = {
      sub: user.userId,
      org_ids: await IdentityClaimsService.orgIdsForUser(user.userId),
    };
    if (user.email) claims.email = user.email;
    if (user.name) claims.name = user.name;
    return claims;
  }

  /**
   * How the user signed in, for the id_token `amr` claim.
   *
   * Signing in with a password is always required. When the user has two-factor
   * authentication turned on, the login also needs a code from the app or a
   * recovery code, which is the same condition `authorize()` in lib/auth.ts uses.
   */
  public static async authenticationMethods(userId: string): Promise<string[]> {
    const user = await db.models.User.findOne({ where: { userId } });
    const usesSecondFactor = Boolean(
      user?.twoFactorEnabled && user.twoFactorSecret,
    );
    return usesSecondFactor ? ["pwd", "otp"] : ["pwd"];
  }

  /**
   * Ids of the organizations a user belongs to, sorted, without duplicates.
   * Three routes lead to an organization: being its admin, being admin of one
   * of its projects, and having access to one of the cities in its projects.
   */
  public static async orgIdsForUser(userId: string): Promise<string[]> {
    const [orgAdmins, projectAdmins, cityUsers] = await Promise.all([
      db.models.OrganizationAdmin.findAll({ where: { userId } }),
      db.models.ProjectAdmin.findAll({
        where: { userId },
        include: [{ model: db.models.Project, as: "project" }],
      }),
      db.models.CityUser.findAll({
        where: { userId },
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [{ model: db.models.Project, as: "project" }],
          },
        ],
      }),
    ]);

    const ids = new Set<string>();
    for (const row of orgAdmins) {
      ids.add(row.organizationId);
    }
    for (const row of projectAdmins) {
      if (row.project?.organizationId) ids.add(row.project.organizationId);
    }
    for (const row of cityUsers) {
      const organizationId = row.city?.project?.organizationId;
      if (organizationId) ids.add(organizationId);
    }
    return [...ids].sort();
  }
}
