import { db } from "@/models";
import { Roles } from "@/util/types";
import { logger } from "@/services/logger";

export type OidcProfileClaims = {
  sub: string;
  email?: string | null;
  name?: string | null;
};

/**
 * Ensures CityCatalyst has a profile row for an identity `sub`.
 * Creates without credentials on first login; syncs email/name and stamps lastActiveAt.
 */
export async function ensureLocalUserFromOidc(claims: OidcProfileClaims): Promise<{
  id: string;
  email?: string;
  name?: string;
  role: Roles;
}> {
  if (!claims.sub) {
    throw new Error("OIDC profile missing sub");
  }

  if (!db.initialized) {
    await db.initialize();
  }

  const email = claims.email?.toLowerCase() || undefined;
  const name = claims.name || undefined;

  let user = await db.models.User.findByPk(claims.sub);

  if (!user) {
    user = await db.models.User.create({
      userId: claims.sub,
      email,
      name,
      role: Roles.User,
      lastActiveAt: new Date(),
    });
    logger.info({ userId: user.userId }, "Created CityCatalyst profile from identity sub");
  } else {
    const patch: {
      email?: string;
      name?: string;
      lastActiveAt: Date;
    } = { lastActiveAt: new Date() };
    if (email && email !== user.email) {
      patch.email = email;
    }
    if (name && name !== user.name) {
      patch.name = name;
    }
    try {
      await user.update(patch);
    } catch (err: unknown) {
      logger.error({ err }, "Failed to sync profile from identity claims");
    }
  }

  return {
    id: user.userId,
    email: user.email,
    name: user.name,
    role: (user.role as Roles) ?? Roles.User,
  };
}
