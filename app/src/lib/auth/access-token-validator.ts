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
  method: string,
  pathname?: string
): Promise<PATValidationResult> {
  const tokenHash = hashToken(token);

  const pat = await db.models.PersonalAccessToken.findOne({
    where: { tokenHash },
    include: [
      {
        model: db.models.User,
        as: "user",
      },
    ],
  });

  if (!pat) {
    throw new createHttpError.Unauthorized("Invalid access token");
  }

  if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
    throw new createHttpError.Unauthorized("Access token expired");
  }

  const scopes = pat.scopes || [];
  const upperMethod = method.toUpperCase();

  if (["GET", "HEAD"].includes(upperMethod)) {
    if (!scopes.includes("read")) {
      throw new createHttpError.Forbidden(
        "Token does not have read scope"
      );
    }
  }

  const isMcpEndpoint = pathname?.includes("/api/v1/mcp");
  if (["PUT", "PATCH", "POST", "DELETE"].includes(upperMethod)) {
    if (isMcpEndpoint && upperMethod === "POST" && scopes.includes("read")) {
      // Allow read scope for MCP POST requests (JSON-RPC transport)
    } else if (!scopes.includes("write")) {
      throw new createHttpError.Forbidden(
        "Token does not have write scope"
      );
    }
  }

  pat.update({ lastUsedAt: new Date() }).catch(() => {
    // Silently ignore errors when updating lastUsedAt
  });

  const user = pat.user;
  if (!user) {
    throw new createHttpError.Unauthorized("User not found for token");
  }

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

  return { session, scopes };
}
