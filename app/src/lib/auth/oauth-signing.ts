/**
 * Signing key for OAuth JWTs: access tokens and id_tokens issued by
 * `/api/v1/token`. Authorization codes and refresh tokens are opaque database
 * values (see AuthorizationCodeService and RefreshTokenService), not JWTs.
 *
 * OAuth JWTs are signed with their own RS256 key pair. They no longer share
 * `VERIFICATION_TOKEN_SECRET`, which keeps signing invites, email verification
 * and Climate Advisor user tokens. With separate keys, a token minted for one
 * purpose cannot verify as another, and a public key can be published later
 * (JWKS) without exposing any shared secret.
 *
 * `OAUTH_SIGNING_KEY` holds the PEM private key, 2048 bits or more. In an env
 * file or a one-line secret the line breaks may be written as `\n`. To make a
 * key:
 *
 *   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072
 *
 * The key id (`kid` header) is the RFC 7638 thumbprint of the public key, so it
 * needs no extra setting and changes only when the key changes.
 *
 * Nothing here runs at startup. A missing or invalid key is reported the first
 * time an OAuth route needs it, so deployments that keep OAuth switched off
 * (`OAUTH_ENABLED`) need no key.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import createHttpError from "http-errors";
import jwt, {
  type JwtPayload,
  type SignOptions,
  type VerifyOptions,
} from "jsonwebtoken";
import { logger } from "@/services/logger";

/** The only algorithm OAuth tokens are signed and verified with. */
export const OAUTH_SIGNING_ALGORITHM = "RS256";

const MIN_MODULUS_BITS = 2048;

export interface OAuthSigningKey {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** RFC 7638 thumbprint of the public key. */
  kid: string;
}

// Parsing a PEM on every request is wasteful. The cache is keyed on the raw
// value, so a changed variable (for example in tests) is picked up.
let cache: { raw: string; key: OAuthSigningKey } | null = null;

/** Logs the reason and fails with a generic 500. Never includes key material. */
function configError(reason: string): never {
  logger.error(reason);
  throw createHttpError.InternalServerError("Configuration error");
}

/**
 * Loads and checks `OAUTH_SIGNING_KEY`.
 * @throws a 500 error if the variable is missing, is not an RSA private key in
 * PEM form, or is shorter than 2048 bits.
 */
export function getOAuthSigningKey(): OAuthSigningKey {
  const raw = process.env.OAUTH_SIGNING_KEY;
  if (!raw) {
    return configError("Need to assign OAUTH_SIGNING_KEY in env!");
  }
  if (cache?.raw === raw) {
    return cache.key;
  }

  // Allow `\n` written as two characters, as in single-line secrets.
  const pem = raw.replace(/\\n/g, "\n").trim();

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: pem, format: "pem" });
  } catch {
    return configError("OAUTH_SIGNING_KEY is not a valid PEM private key.");
  }
  if (privateKey.asymmetricKeyType !== "rsa") {
    return configError("OAUTH_SIGNING_KEY must be an RSA private key.");
  }
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < MIN_MODULUS_BITS) {
    return configError(
      `OAUTH_SIGNING_KEY must be at least ${MIN_MODULUS_BITS} bits, got ${bits}.`,
    );
  }

  const publicKey = createPublicKey(privateKey);
  const { e, n } = publicKey.export({ format: "jwk" });
  if (!e || !n) {
    return configError("Could not read the public key from OAUTH_SIGNING_KEY.");
  }
  // RFC 7638: required members in lexicographic order, no whitespace.
  const kid = createHash("sha256")
    .update(JSON.stringify({ e, kty: "RSA", n }))
    .digest("base64url");

  const key = { privateKey, publicKey, kid };
  cache = { raw, key };
  return key;
}

/**
 * The public half of the signing key as a JSON Web Key, for the JWKS endpoint.
 * Resource servers and relying parties verify tokens with it, so it must never
 * contain private key members. Only the modulus and exponent are exported.
 */
export function getPublicJwk() {
  const { publicKey, kid } = getOAuthSigningKey();
  const { n, e } = publicKey.export({ format: "jwk" });
  return {
    kty: "RSA",
    use: "sig",
    alg: OAUTH_SIGNING_ALGORITHM,
    kid,
    n,
    e,
  };
}

/**
 * The kind of an OAuth token, written in the JWT `typ` header (explicit typing,
 * RFC 8725). The kinds share one key and similar claims, so without a type an
 * id_token would verify as an access token.
 *
 * Authorization codes and refresh tokens are not JWTs (they are opaque database
 * rows), so they have no type here. The id_token keeps the conventional `JWT`,
 * which OpenID Connect client libraries expect, and still cannot pass as an
 * access token because that requires its own type.
 */
export const OAuthTokenType = {
  Access: "at+jwt", // RFC 9068
  Id: "JWT",
} as const;
export type OAuthTokenType =
  (typeof OAuthTokenType)[keyof typeof OAuthTokenType];

/**
 * Signs an OAuth token of the given type with RS256 and the current key id.
 * The type is required, so every call site has to say what it is issuing.
 */
export function signOAuthToken(
  type: OAuthTokenType,
  payload: object,
  options: SignOptions = {},
): string {
  const { privateKey, kid } = getOAuthSigningKey();
  return jwt.sign(payload, privateKey, {
    ...options,
    algorithm: OAUTH_SIGNING_ALGORITHM,
    keyid: kid,
    header: { alg: OAUTH_SIGNING_ALGORITHM, typ: type },
  });
}

/**
 * Verifies an OAuth token and checks that it is of the expected type. Only
 * RS256 is accepted, so a token signed with an HMAC secret (even one that
 * equals the public key) or with `alg: none` fails.
 * @throws the `jsonwebtoken` error (for example `TokenExpiredError`) if the
 * token is invalid or of another type (`JsonWebTokenError`, so callers that
 * already map these errors answer 400 or 401), and a 500 error if the signing
 * key is misconfigured.
 */
export function verifyOAuthToken(
  token: string,
  type: OAuthTokenType,
  options: VerifyOptions = {},
): JwtPayload {
  const { publicKey } = getOAuthSigningKey();
  const { header, payload } = jwt.verify(token, publicKey, {
    ...options,
    algorithms: [OAUTH_SIGNING_ALGORITHM],
    complete: true,
  });
  if (header.typ !== type) {
    throw new jwt.JsonWebTokenError(`expected token type ${type}`);
  }
  return payload as JwtPayload;
}
