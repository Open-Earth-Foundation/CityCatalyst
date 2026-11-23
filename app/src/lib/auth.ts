import { DefaultSession, getServerSession, NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { Roles } from "@/util/types";
import { logger } from "@/services/logger";
import crypto from "node:crypto";
import { getIdentityServerConfig } from "./identity-config";
import { ensureLocalUserFromOidc } from "./identity-user";

export type AppSession = DefaultSession & {
  user: {
    id: string;
    role: Roles;
  };
  csrfSecret?: string;
};

export class Auth {
  static async getServerSession(): Promise<AppSession | null> {
    return await getServerSession(authOptions);
  }
}

type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Roles;
};

type IdentityIdToken = {
  sub: string;
  email?: string;
  name?: string;
};

function buildIdentityProvider(): OAuthConfig<IdentityIdToken> | null {
  const config = getIdentityServerConfig();
  if (!config) {
    logger.warn(
      "IDENTITY_ISSUER / CLIENT_ID / CLIENT_SECRET incomplete; identity provider not registered",
    );
    return null;
  }

  return {
    id: "identity",
    name: "OpenEarth Identity",
    type: "oauth",
    wellKnown: `${config.issuer}/.well-known/openid-configuration/`,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorization: { params: { scope: "openid read" } },
    idToken: true,
    checks: ["pkce", "state"],
    client: { token_endpoint_auth_method: "client_secret_basic" },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.email ?? profile.sub,
        email: profile.email,
      };
    },
  };
}

function buildProviders(): NextAuthOptions["providers"] {
  const identity = buildIdentityProvider();
  return identity ? [identity] : [];
}

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: buildProviders(),
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "identity") {
        return false;
      }
      try {
        const local = await ensureLocalUserFromOidc({
          sub: user.id,
          email: user.email,
          name: user.name,
        });
        user.id = local.id;
        (user as AuthUser).role = local.role;
        if (local.email) user.email = local.email;
        if (local.name) user.name = local.name;
        return true;
      } catch (err: unknown) {
        logger.error(
          { err },
          "Failed to provision CityCatalyst user from identity",
        );
        return false;
      }
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.role = (user as AuthUser).role;
        token.picture = user.image;
        token.name = user.name;
        token.csrfSecret = crypto.randomBytes(32).toString("hex");
      }
      return token;
    },
    session: ({ session, token }) => {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          role: token.role,
        },
        csrfSecret: token.csrfSecret,
      };
    },
  },
};
