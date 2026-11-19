import { createHash, randomBytes } from "node:crypto";
import createHttpError from "http-errors";
import { Op } from "sequelize";
import { AuthorizationCode } from "@/models/AuthorizationCode";
import { logger } from "@/services/logger";

/** A code is valid for one minute. */
export const AUTHORIZATION_CODE_LIFETIME_SECONDS = 60;

// Expired rows are kept a while after they expire, so a late replay still
// finds the row and is reported as a replay, then removed.
const PRUNE_AFTER_EXPIRY_MS = 10 * 60 * 1000;

export interface IssueCodeParams {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  nonce?: string | null;
}

export interface RedeemCodeParams {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

/** Hex SHA-256. The database only ever sees this, never the code. */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) must equal the challenge. */
function verifyPKCE(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return computed === challenge;
}

/**
 * Authorization codes for the OAuth 2.0 authorization code flow with PKCE.
 *
 * A code is 256 random bits, handed to the client once. Only its SHA-256 hash
 * is stored, with the client, redirect URI, PKCE challenge, user and nonce it
 * was issued for. Because the state is in the database, a code cannot be
 * replayed against another replica of the app.
 */
export default class AuthorizationCodeService {
  /** Stores a new code and returns the plain value to give to the client. */
  public static async issue(params: IssueCodeParams): Promise<string> {
    const code = randomBytes(32).toString("base64url");

    await AuthorizationCode.create({
      codeHash: hashCode(code),
      clientId: params.clientId,
      userId: params.userId,
      redirectURI: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256",
      scope: params.scope,
      nonce: params.nonce ?? null,
      expires: new Date(
        Date.now() + AUTHORIZATION_CODE_LIFETIME_SECONDS * 1000,
      ),
    });

    // Housekeeping on each issue, so no scheduled job is needed.
    await AuthorizationCode.destroy({
      where: {
        expires: { [Op.lt]: new Date(Date.now() - PRUNE_AFTER_EXPIRY_MS) },
      },
    });

    return code;
  }

  /**
   * Exchanges a code for the grant it was issued for.
   *
   * The code is consumed first, with a conditional update, so two requests with
   * the same code cannot both succeed. It is spent even if a later check fails.
   * That limits anyone holding a stolen code to a single attempt.
   *
   * @throws a 400 error if the code is unknown, expired, already used, or does
   * not match the client, redirect URI or PKCE verifier.
   */
  public static async redeem(
    params: RedeemCodeParams,
  ): Promise<AuthorizationCode> {
    const codeHash = hashCode(params.code);

    const row = await AuthorizationCode.findByPk(codeHash);
    if (!row) {
      throw createHttpError.BadRequest("Invalid authorization code.");
    }
    if (row.expires.getTime() <= Date.now()) {
      throw createHttpError.BadRequest("Code has expired.");
    }

    // Only one request can move consumed_at from NULL to a time.
    const [consumed] = await AuthorizationCode.update(
      { consumedAt: new Date() },
      { where: { codeHash, consumedAt: null } },
    );
    if (consumed === 0) {
      logger.debug({ clientId: row.clientId }, "Replayed authorization code");
      throw createHttpError.BadRequest("Single-use code.");
    }

    if (row.clientId !== params.clientId) {
      throw createHttpError.BadRequest("client_id mismatch with code.");
    }
    if (row.redirectURI !== params.redirectUri) {
      throw createHttpError.BadRequest("redirect_uri mismatch with code.");
    }
    if (!verifyPKCE(params.codeVerifier, row.codeChallenge)) {
      throw createHttpError.BadRequest("PKCE verification failed.");
    }

    return row;
  }
}
