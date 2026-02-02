import { createHash } from "crypto";
import { db } from "@/models";
import { AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";
import createHttpError from "http-errors";

const PAT_PREFIX = "cc_pat_";

export function isPATToken(token: string): boolean {
  return token.startsWith(PAT_PREFIX);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PATValidationResult {
  session: AppSession;
  scopes: string[];
}

export async function validatePAT(
  token: string,
  method: string
): Promise<PATValidationResult> {
  // 1. Hash the token
  const tokenHash = hashToken(token);

  // 2. Find PersonalAccessToken by tokenHash, include User
  if (!db.initialized) {
    await db.initialize();
  }

  const pat = await db.models.PersonalAccessToken.findOne({
    where: { tokenHash },
    include: [
      {
        model: db.models.User,
        as: "user",
      },
    ],
  });

  // 3. If not found: throw 401 "Invalid access token"
  if (!pat) {
    throw new createHttpError.Unauthorized("Invalid access token");
  }

  // 4. If expired (expiresAt < now): throw 401 "Access token expired"
  if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
    throw new createHttpError.Unauthorized("Access token expired");
  }

  // 5. Check scopes
  const scopes = pat.scopes || [];
  const upperMethod = method.toUpperCase();

  // GET/HEAD need "read" scope
  if (["GET", "HEAD"].includes(upperMethod)) {
    if (!scopes.includes("read")) {
      throw new createHttpError.Forbidden(
        "Token does not have read permission"
      );
    }
  }

  // PUT/PATCH/POST/DELETE need "write" scope
  if (["PUT", "PATCH", "POST", "DELETE"].includes(upperMethod)) {
    if (!scopes.includes("write")) {
      throw new createHttpError.Forbidden(
        "Token does not have write permission"
      );
    }
  }

  // 6. Update lastUsedAt (fire and forget, catch errors)
  pat.update({ lastUsedAt: new Date() }).catch(() => {
    // Silently ignore errors when updating lastUsedAt
  });

  // 7. If no user: throw 401 "User not found for token"
  const user = pat.user;
  if (!user) {
    throw new createHttpError.Unauthorized("User not found for token");
  }

  // 8. Build AppSession with user data
  const session: AppSession = {
    expires: pat.expiresAt
      ? new Date(pat.expiresAt).toISOString()
      : "9999-12-31T23:59:59Z",
    user: {
      id: user.userId,
      name: user.name || "",
      email: user.email || "",
      image: user.pictureUrl || null,
      role: user.role || Roles.User,
    },
  };

  // 9. Return { session, scopes }
  return { session, scopes };
}
