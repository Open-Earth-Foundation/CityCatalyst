/**
 * Where OAuth tokens come from and who they are for.
 *
 * Three optional settings. With none of them set, everything falls back to
 * `HOST` (or the request origin), which is how the app behaved before they
 * existed, so deploying the code changes nothing until they are configured.
 *
 * - `OAUTH_ISSUER`: the `iss` of tokens this server issues, and the `iss` the
 *   API requires. Default: `HOST`.
 * - `OAUTH_AUDIENCE`: the `aud` of access and refresh tokens, and the `aud` the
 *   API requires. It names the API the token is for, not the host a request
 *   happened to arrive on. Default: `HOST`.
 * - `OAUTH_JWKS_URI`: where to fetch the public keys that verify access tokens.
 *   When unset, the API verifies with the public half of its own
 *   `OAUTH_SIGNING_KEY`, which is right while this app is also the issuer.
 *   Set it once the authorization server runs elsewhere.
 *
 * The issuer, the audience and the API all read them here, so what is signed
 * and what is checked cannot drift apart.
 */

/** This server's own address, used when no explicit value is configured. */
function ownOrigin(req: Request): string {
  return process.env.HOST || new URL(req.url).origin;
}

export function getOAuthIssuer(req: Request): string {
  return process.env.OAUTH_ISSUER || ownOrigin(req);
}

export function getOAuthAudience(req: Request): string {
  return process.env.OAUTH_AUDIENCE || ownOrigin(req);
}

/** The JWKS URL to verify access tokens with, or undefined to use the local key. */
export function getOAuthJwksUri(): string | undefined {
  return process.env.OAUTH_JWKS_URI || undefined;
}
