import { createHash, randomBytes, randomUUID } from "node:crypto";
import createHttpError from "http-errors";
import { Op, Transaction } from "sequelize";
import { RefreshToken } from "@/models/RefreshToken";
import { logger } from "@/services/logger";
import { hasActiveGrant, isGrantActive } from "./grants";

/** A refresh token is valid for 30 days from the moment it is issued. */
export const REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

// Expired rows are kept a while, so a late replay of a stolen token still finds
// its row and revokes the family, and then they are removed.
const PRUNE_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Hex SHA-256. The database only ever sees this, never the token. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface RefreshGrant {
  clientId: string;
  userId: string;
  scope: string;
  familyId: string;
}

/**
 * Refresh tokens for the OAuth 2.0 refresh_token grant.
 *
 * A token is 256 random bits, handed to the client once. Only its SHA-256 hash
 * is stored. Tokens that come from one authorization form a family.
 *
 * Every use consumes the token and issues the next one in the family
 * (rotation). A token that is used a second time was copied by someone, and
 * there is no telling which of the two holders is the real client, so the whole
 * family is revoked and the user must authorize again. The same happens when
 * the user revokes the app.
 */
export default class RefreshTokenService {
  /**
   * Stores a new token and returns the plain value to give to the client. Pass
   * a `familyId` to continue an existing family. Without one, a new family
   * starts.
   */
  public static async issue(
    params: {
      clientId: string;
      userId: string;
      scope: string;
      familyId?: string;
    },
    transaction?: Transaction,
  ): Promise<{ token: string; familyId: string }> {
    const token = randomBytes(32).toString("base64url");
    const familyId = params.familyId ?? randomUUID();

    await RefreshToken.create(
      {
        tokenHash: hashToken(token),
        familyId,
        clientId: params.clientId,
        userId: params.userId,
        scope: params.scope,
        expires: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_SECONDS * 1000),
      },
      { transaction },
    );

    // Housekeeping on each issue, so no scheduled job is needed.
    await RefreshToken.destroy({
      where: {
        expires: { [Op.lt]: new Date(Date.now() - PRUNE_AFTER_EXPIRY_MS) },
      },
      transaction,
    });

    return { token, familyId };
  }

  /**
   * Exchanges a refresh token for the next one in its family.
   *
   * The token is consumed with a conditional update, so two requests with the
   * same token cannot both succeed, on any replica.
   *
   * @throws a 400 if the token is unknown, expired, revoked, or belongs to
   * another client, and a 401 if the user has revoked the app. Presenting a
   * token that was already used revokes its whole family.
   */
  public static async rotate(params: {
    token: string;
    clientId: string;
  }): Promise<{ token: string } & RefreshGrant> {
    const tokenHash = hashToken(params.token);
    const row = await RefreshToken.findByPk(tokenHash);

    // The same message for every reason a token cannot be used, so the answer
    // tells a thief nothing. Another client's token counts as unknown.
    if (!row || row.clientId !== params.clientId || row.revokedAt) {
      throw createHttpError.BadRequest("Invalid refresh token.");
    }
    if (row.expires.getTime() <= Date.now()) {
      throw createHttpError.BadRequest("Refresh token has expired.");
    }

    // The user may have revoked the app since the token was issued.
    if (!(await isGrantActive(row.clientId, row.userId))) {
      await RefreshTokenService.revokeFamily(row.familyId);
      throw createHttpError.Unauthorized("Authorization revoked");
    }

    // Consume this token and issue the next one together, so a failure cannot
    // leave the client with neither. Only one request can move consumed_at from
    // NULL to a time.
    const next = await RefreshToken.sequelize!.transaction(
      async (transaction) => {
        const [consumed] = await RefreshToken.update(
          { consumedAt: new Date() },
          {
            where: { tokenHash, consumedAt: null, revokedAt: null },
            transaction,
          },
        );
        if (consumed === 0) return null;
        return RefreshTokenService.issue(
          {
            clientId: row.clientId,
            userId: row.userId,
            scope: row.scope,
            familyId: row.familyId,
          },
          transaction,
        );
      },
    );

    if (!next) {
      // Already used, or revoked while this request was running. A token that
      // was used before is a copy: revoke the family.
      const current = await RefreshToken.findByPk(tokenHash);
      if (current?.consumedAt && !current.revokedAt) {
        logger.warn(
          { clientId: row.clientId, familyId: row.familyId },
          "Refresh token reuse detected, token family revoked",
        );
        await RefreshTokenService.revokeFamily(row.familyId);
      }
      throw createHttpError.BadRequest("Invalid refresh token.");
    }

    return {
      token: next.token,
      clientId: row.clientId,
      userId: row.userId,
      scope: row.scope,
      familyId: row.familyId,
    };
  }

  /** Revokes every token of a family. */
  public static async revokeFamily(familyId: string): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { familyId, revokedAt: null } },
    );
  }

  /**
   * Revokes the family a token belongs to. Does nothing for a token that does
   * not exist or belongs to another client, and says nothing about it either,
   * as RFC 7009 requires.
   */
  public static async revokeByToken(
    token: string,
    clientId: string,
  ): Promise<void> {
    const row = await RefreshToken.findByPk(hashToken(token));
    if (row && row.clientId === clientId) {
      await RefreshTokenService.revokeFamily(row.familyId);
    }
  }

  /** Revokes every token a user holds for an app. Used when the user removes it. */
  public static async revokeForGrant(
    clientId: string,
    userId: string,
  ): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { clientId, userId, revokedAt: null } },
    );
  }

  /**
   * The row of a refresh token that can still be used, or null. Reads only: it
   * does not consume the token. Used for introspection.
   */
  public static async findActive(token: string): Promise<RefreshToken | null> {
    const row = await RefreshToken.findByPk(hashToken(token));
    if (!row || row.revokedAt || row.consumedAt) return null;
    if (row.expires.getTime() <= Date.now()) return null;
    if (!(await hasActiveGrant(row.clientId, row.userId))) return null;
    return row;
  }
}
