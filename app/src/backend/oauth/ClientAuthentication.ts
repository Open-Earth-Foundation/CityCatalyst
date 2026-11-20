import { createHash, timingSafeEqual } from "node:crypto";
import createHttpError from "http-errors";
import { OAuthClient } from "@/models/OAuthClient";
import type { ApiHandlerOptions } from "@/util/api";

/**
 * For the OAuth endpoints that clients and resource servers call with their own
 * credentials (token, revocation, introspection). apiHandler would otherwise
 * try to read the Authorization header as a user token or a session, and reject
 * HTTP Basic as malformed. The route authenticates the caller itself.
 */
export const AUTHENTICATES_ITSELF: ApiHandlerOptions = {
  authenticateRequest: () => null,
};

/** Hex SHA-256 of a client or resource server secret. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Whether a secret matches a stored hash, in constant time. The secrets are
 * long random values (not passwords), so a fast hash is enough to keep them out
 * of the database in clear text.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const given = Buffer.from(hashSecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/**
 * Reads `Authorization: Basic base64(id:secret)` (RFC 7617). Per RFC 6749
 * section 2.3.1 the id and the secret are form-encoded before they are joined.
 * Returns null when there is no Basic header or it is malformed.
 */
export function parseBasicCredentials(
  req: Request,
): { id: string; secret: string } | null {
  const match = req.headers.get("authorization")?.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  try {
    return {
      id: decodeURIComponent(decoded.slice(0, colon)),
      secret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  } catch {
    return null;
  }
}

/**
 * Identifies the client that is calling the token or revocation endpoint.
 *
 * - A **public** client (no secret on record) names itself with `client_id` in
 *   the request body. That is all there is to check: PKCE protects its codes,
 *   and its refresh tokens are bound to its `client_id`.
 * - A **confidential** client (it has a secret on record) must send HTTP Basic
 *   credentials (`client_secret_basic`). A `client_id` in the body is not enough.
 *
 * The same answer for an unknown client and a wrong secret, so the response
 * does not say which client ids exist.
 *
 * @throws a 401 if the client cannot be identified.
 */
export async function authenticateClient(
  req: Request,
  bodyClientId: string | undefined,
): Promise<OAuthClient> {
  const failure = () =>
    createHttpError.Unauthorized("Client authentication failed.");

  const basic = parseBasicCredentials(req);
  if (req.headers.get("authorization")?.match(/^Basic\s/i) && !basic) {
    throw failure();
  }

  const clientId = basic?.id ?? bodyClientId;
  if (!clientId) throw failure();
  // A client_id in the body must agree with the one in the header.
  if (basic && bodyClientId && bodyClientId !== basic.id) throw failure();

  const client = await OAuthClient.findByPk(clientId);
  if (!client) throw failure();

  if (client.clientSecretHash) {
    if (!basic || !secretMatches(basic.secret, client.clientSecretHash)) {
      throw failure();
    }
  } else if (basic) {
    // A public client has no secret to present.
    throw failure();
  }
  return client;
}

/**
 * Identifies the resource server that is calling the introspection endpoint.
 *
 * Resource servers are listed in `OAUTH_RESOURCE_SERVERS` as comma separated
 * `id:secret` pairs and authenticate with HTTP Basic. With nothing configured,
 * no one may introspect.
 *
 * @returns the id of the resource server.
 * @throws a 401 if the caller is not a registered resource server.
 */
export function authenticateResourceServer(req: Request): string {
  const failure = () =>
    createHttpError.Unauthorized("Resource server authentication failed.");

  const basic = parseBasicCredentials(req);
  if (!basic) throw failure();

  const registered = (process.env.OAUTH_RESOURCE_SERVERS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const colon = pair.indexOf(":");
      return colon < 0
        ? null
        : { id: pair.slice(0, colon), secret: pair.slice(colon + 1) };
    });

  // Every entry is compared, so the time taken does not show which ids exist.
  let matched = false;
  for (const entry of registered) {
    if (
      entry &&
      entry.id === basic.id &&
      secretMatches(basic.secret, hashSecret(entry.secret))
    ) {
      matched = true;
    }
  }
  if (!matched) throw failure();
  return basic.id;
}
