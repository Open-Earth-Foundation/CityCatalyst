import { env } from "@/lib/runtime-env";
import { FeatureFlags, hasFeatureFlag, hasServerFeatureFlag } from "@/util/feature-flags";

/** Server-side identity OIDC settings. Secret never goes to the browser. */
export function getIdentityServerConfig(): {
  issuer: string;
  clientId: string;
  clientSecret: string;
} | null {
  const issuer = (
    process.env.IDENTITY_ISSUER ||
    process.env.NEXT_PUBLIC_IDENTITY_ISSUER ||
    ""
  ).replace(/\/+$/, "");
  const clientId =
    process.env.IDENTITY_CLIENT_ID ||
    process.env.NEXT_PUBLIC_IDENTITY_CLIENT_ID ||
    "";
  const clientSecret = process.env.IDENTITY_CLIENT_SECRET || "";

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }
  return { issuer, clientId, clientSecret };
}

/** Whether the OIDC relying-party path is active on the server. */
export function isIdentityLoginEnabledServer(): boolean {
  return (
    hasServerFeatureFlag(FeatureFlags.IDENTITY_SERVICE_LOGIN) &&
    getIdentityServerConfig() != null
  );
}

/** Client-safe issuer and client id for logout / signup redirects. */
export function getIdentityPublicConfig(): {
  issuer: string;
  clientId: string;
} | null {
  const issuer = (
    env("NEXT_PUBLIC_IDENTITY_ISSUER") ||
    process.env.NEXT_PUBLIC_IDENTITY_ISSUER ||
    ""
  ).replace(/\/+$/, "");
  const clientId =
    env("NEXT_PUBLIC_IDENTITY_CLIENT_ID") ||
    process.env.NEXT_PUBLIC_IDENTITY_CLIENT_ID ||
    "";
  if (!issuer || !clientId) return null;
  return { issuer, clientId };
}

export function isIdentityLoginEnabledClient(): boolean {
  return (
    hasFeatureFlag(FeatureFlags.IDENTITY_SERVICE_LOGIN) &&
    getIdentityPublicConfig() != null
  );
}

/** Builds the RP-initiated logout URL for the identity OP. */
export function buildIdentityEndSessionUrl(
  postLogoutRedirectUri: string,
): string | null {
  const config = getIdentityPublicConfig();
  if (!config) return null;
  const url = new URL(`${config.issuer}/oauth/end-session/`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  return url.toString();
}
